import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { startSummarization } from "./llm";

// 百炼异步转写（filetrans）：提交 → 轮询 → 下载结果 JSON，官方文档 2026-10-06 核对
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
const POLL_INTERVAL_MS = 3_000;
const TRANSCRIBE_TIMEOUT_MS = 45 * 60 * 1000; // 6 小时上限集 ≤45 分钟目标

const asrModel = () => process.env.ASR_MODEL || "qwen-audio-3.1-asr-flash-filetrans";

export type Segment = { start: number; end: number; text: string };

// 进程内防重复（dev 热重载用 globalThis 兜底）
const globalForAsr = globalThis as unknown as { transcribingTasks?: Set<number> };
const transcribing = (globalForAsr.transcribingTasks ??= new Set<number>());

/** fire-and-forget 启动转写任务 */
export function startTranscription(episodeId: number): void {
  if (transcribing.has(episodeId)) return;
  transcribing.add(episodeId);
  void runTranscription(episodeId)
    .catch(() => undefined) // 内部已落库，兜底防未捕获拒绝
    .finally(() => transcribing.delete(episodeId));
}

/** 转写任务是否在进程内真的运行 */
export function isTranscribing(episodeId: number): boolean {
  return transcribing.has(episodeId);
}

async function runTranscription(episodeId: number): Promise<void> {
  const fail = async (errorMsg: string) => {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "failed", errorMsg },
    });
  };

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode?.audioPath) {
    await fail("没有可转写的音频文件");
    return;
  }

  // Mock 通路：无 Key 时验证状态机/入库/渲染（ASR_MOCK=1）
  if (process.env.ASR_MOCK === "1") {
    await new Promise((r) => setTimeout(r, 2000));
    const dur = episode.durationSec ?? 60;
    const third = Math.max(Math.floor(dur / 3), 1);
    await saveTranscript(episodeId, [
      { start: 0, end: third, text: "（Mock）这是第一段转写文本，用于验证状态机与页面渲染。" },
      { start: third, end: third * 2, text: "（Mock）这是第二段转写文本，带时间戳分段。" },
      { start: third * 2, end: dur, text: "（Mock）这是第三段转写文本，真实联调请配置 DASHSCOPE_API_KEY。" },
    ]);
    return;
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    await fail("请先在 .env 配置 DASHSCOPE_API_KEY（百炼控制台申请，每月有免费额度）");
    return;
  }

  try {
    const ossUrl = await uploadToTempStorage(apiKey, episode.audioPath);
    console.log(`[asr] #${episodeId} 上传完成: ${ossUrl}`);
    const taskId = await submitTranscription(apiKey, ossUrl);
    console.log(`[asr] #${episodeId} 已提交: task_id=${taskId}`);
    const segments = await pollTranscription(apiKey, taskId);
    console.log(`[asr] #${episodeId} 转写完成: ${segments.length} 段`);
    if (segments.length === 0) throw new Error("转写结果为空（可能是静音或无人声）");
    await saveTranscript(episodeId, segments);
  } catch (err) {
    console.error(`[asr] #${episodeId} 转写失败:`, err);
    await fail(err instanceof Error ? err.message : String(err));
  }
}

async function saveTranscript(episodeId: number, segments: Segment[]): Promise<void> {
  await prisma.transcript.upsert({
    where: { episodeId },
    create: { episodeId, segments: JSON.stringify(segments) },
    update: { segments: JSON.stringify(segments) },
  });
  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "summarizing", errorMsg: null, transcribedAt: new Date() },
  });
  startSummarization(episodeId); // 转写完成自动接梳理
}

/** 百炼临时存储：getPolicy → multipart 上传 → oss:// URL（48h 有效） */
async function uploadToTempStorage(apiKey: string, filePath: string): Promise<string> {
  const policyRes = await fetch(
    `${DASHSCOPE_BASE}/uploads?action=getPolicy&model=${encodeURIComponent(asrModel())}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (policyRes.status === 401) throw new Error("百炼 API Key 无效，请检查 .env 配置");
  if (!policyRes.ok) throw new Error(`获取上传凭证失败（HTTP ${policyRes.status}）`);
  const { data } = (await policyRes.json()) as { data: Record<string, string> };

  const fileName = path.basename(filePath);
  const key = `${data.upload_dir}/${fileName}`;
  const fileBuffer = await fs.readFile(filePath);

  const form = new FormData();
  form.append("OSSAccessKeyId", data.oss_access_key_id);
  form.append("Signature", data.signature);
  form.append("policy", data.policy);
  form.append("x-oss-object-acl", data.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", data.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  form.append("file", new Blob([fileBuffer]), fileName); // file 必须是最后一个表单域

  const uploadRes = await fetch(data.upload_host, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!uploadRes.ok) throw new Error(`上传到临时存储失败（HTTP ${uploadRes.status}）`);
  return `oss://${key}`;
}

/** 提交异步转写任务，返回 task_id */
async function submitTranscription(apiKey: string, ossUrl: string): Promise<string> {
  const res = await fetch(`${DASHSCOPE_BASE}/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable", // 解析 oss:// 临时 URL 必需
    },
    body: JSON.stringify({
      model: asrModel(),
      input: { file_urls: [ossUrl] },
      parameters: {
        channel_id: [0],
        language_hints: ["zh", "en"],
        // 关闭系统敏感词过滤（默认会把命中词替换成 ***，损伤原文）
        special_word_filter: { system_reserved_filter: false },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    output?: { task_id?: string };
    code?: string;
    message?: string;
  };
  if (res.status === 401) throw new Error("百炼 API Key 无效，请检查 .env 配置");
  if (res.status === 403 || res.status === 429) {
    throw new Error(`百炼额度不足或触发限流（${json.message ?? `HTTP ${res.status}`}）`);
  }
  const taskId = json.output?.task_id;
  if (!res.ok || !taskId) {
    throw new Error(`提交转写任务失败：${json.message ?? `HTTP ${res.status}`}`);
  }
  return taskId;
}

/** 轮询任务直到完成，返回解析后的分段 */
async function pollTranscription(apiKey: string, taskId: string): Promise<Segment[]> {
  const deadline = Date.now() + TRANSCRIBE_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error("转写超时（45 分钟），请重试");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let json: {
      output?: {
        task_status?: string;
        message?: string;
        results?: Array<{ subtask_status?: string; transcription_url?: string; message?: string }>;
      };
    };
    try {
      const res = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      json = await res.json();
    } catch {
      continue; // 单次轮询网络抖动，下一轮再试
    }

    const status = json.output?.task_status;
    if (status === "SUCCEEDED") {
      const result = json.output?.results?.[0];
      if (result?.subtask_status !== "SUCCEEDED" || !result.transcription_url) {
        throw new Error(`转写子任务失败：${result?.message ?? "未知原因"}`);
      }
      // transcription_url 24h 内有效，立即下载解析
      const tr = await fetch(result.transcription_url, { signal: AbortSignal.timeout(60_000) });
      if (!tr.ok) throw new Error(`下载转写结果失败（HTTP ${tr.status}）`);
      return parseSegments(await tr.json());
    }
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`转写任务${status === "FAILED" ? "失败" : "被取消"}：${json.output?.message ?? "未知原因"}`);
    }
    // PENDING / RUNNING：继续轮询
  }
}

/** 百炼结果 JSON → 统一分段格式（毫秒 → 秒） */
function parseSegments(data: unknown): Segment[] {
  const transcripts = (data as {
    transcripts?: Array<{ sentences?: Array<{ begin_time?: number; end_time?: number; text?: string }> }>;
  })?.transcripts;
  if (!Array.isArray(transcripts)) return [];
  return transcripts
    .flatMap((t) => t.sentences ?? [])
    .filter((s) => typeof s.begin_time === "number" && typeof s.end_time === "number" && s.text)
    .map((s) => ({
      start: Math.round(s.begin_time! / 100) / 10,
      end: Math.round(s.end_time! / 100) / 10,
      text: s.text!.trim(),
    }))
    .sort((a, b) => a.start - b.start);
}
