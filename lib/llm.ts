import { prisma } from "./prisma";
import type { Segment } from "./asr";

// DeepSeek OpenAI 兼容接口（官方文档 2026-10-06 核对：当前模型 deepseek-v4-flash / deepseek-v4-pro）
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const llmModel = () => process.env.LLM_MODEL || "deepseek-v4-flash";

export { llmModel };
const LLM_TIMEOUT_MS = 5 * 60 * 1000;
// 单次直读的文稿字符上限；超过则走 Map-Reduce 兜底（deepseek-v4-flash 1M 上下文，99% 单集用不到）
const MAX_SINGLE_PASS_CHARS = 800_000;

const REQUIRED_SECTIONS = ["一句话摘要", "全文总结", "章节大纲", "核心要点", "金句摘录"];

const SYSTEM_PROMPT = `你是一名资深内容编辑，负责把播客转写文稿梳理成结构化文章。

严格要求：
1. 内容必须严格来自文稿，不得编造文稿中没有的信息、人名、观点。
2. 按下面的固定 Markdown 骨架输出，五个板块一个都不能少，标题文字完全一致：

# 一句话摘要
## 全文总结（300 字内）
## 章节大纲（按时间戳分段，每段一个小标题+要点，标注起止时间如 [05:20-18:30]）
## 核心要点（5–10 条，每条注明依据来自文稿哪个部分）
## 金句摘录（必须是文稿中的原文原句，标注时间点如 [12:05]）

3. 文稿是按时间戳分段的转写文本（每行 [mm:ss] 开头），口语冗余和 ASR 错字自行理顺，但不得改变原意。
4. 直接输出 Markdown 正文，不要输出任何额外说明。`;

const globalForLlm = globalThis as unknown as { summarizingTasks?: Set<number> };
const summarizing = (globalForLlm.summarizingTasks ??= new Set<number>());

/** fire-and-forget 启动梳理任务 */
export function startSummarization(episodeId: number): void {
  if (summarizing.has(episodeId)) return;
  summarizing.add(episodeId);
  void runSummarization(episodeId)
    .catch(() => undefined) // 内部已落库，兜底防未捕获拒绝
    .finally(() => summarizing.delete(episodeId));
}

function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function buildTranscriptText(segments: Segment[]): string {
  return segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join("\n");
}

async function runSummarization(episodeId: number): Promise<void> {
  const fail = async (errorMsg: string) => {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "failed", errorMsg },
    });
  };

  const transcript = await prisma.transcript.findUnique({ where: { episodeId } });
  if (!transcript) {
    await fail("没有可梳理的文字稿");
    return;
  }

  // Mock 通路：验证状态机与渲染（LLM_MOCK=1）
  if (process.env.LLM_MOCK === "1") {
    await new Promise((r) => setTimeout(r, 1500));
    await saveArticle(episodeId, `# 一句话摘要\n\n（Mock）这是播客的 Mock 一句话摘要。\n\n## 全文总结\n\n（Mock）用于验证状态机与页面渲染的假总结。\n\n## 章节大纲\n\n- [00:00-05:00] **开场**：（Mock）要点\n\n## 核心要点\n\n1. （Mock）要点一\n\n## 金句摘录\n\n> （Mock）"假金句" [00:30]`);
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    await fail("请先在 .env 配置 DEEPSEEK_API_KEY（platform.deepseek.com 申请）");
    return;
  }

  try {
    const segments = JSON.parse(transcript.segments) as Segment[];
    const text = buildTranscriptText(segments);
    console.log(`[llm] #${episodeId} 文稿 ${text.length} 字符，开始梳理（模型 ${llmModel()}）`);

    let article = await summarizeText(text, apiKey);

    // 结构校验：五个板块必须齐全，缺则补一句硬约束重试一次
    if (!hasAllSections(article)) {
      console.warn(`[llm] #${episodeId} 首次输出板块不全，重试一次`);
      article = await summarizeText(text, apiKey, true);
      if (!hasAllSections(article)) throw new Error("梳理输出结构不完整（缺少固定板块），请重试");
    }

    await saveArticle(episodeId, article);
    console.log(`[llm] #${episodeId} 梳理完成，文章 ${article.length} 字符`);
  } catch (err) {
    console.error(`[llm] #${episodeId} 梳理失败:`, err);
    await fail(err instanceof Error ? err.message : String(err));
  }
}

function hasAllSections(md: string): boolean {
  return REQUIRED_SECTIONS.every((s) => md.includes(s));
}

async function saveArticle(episodeId: number, contentMd: string): Promise<void> {
  await prisma.article.upsert({
    where: { episodeId },
    create: { episodeId, contentMd },
    update: { contentMd },
  });
  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "done", errorMsg: null, summarizedAt: new Date() },
  });
}

/** 文稿 → 五板块文章；超长走 Map-Reduce */
async function summarizeText(text: string, apiKey: string, strict = false): Promise<string> {
  if (text.length <= MAX_SINGLE_PASS_CHARS) {
    const userPrompt = `${strict ? "【重试】上一次输出缺少固定板块，这次必须完整输出五个板块。\n\n" : ""}以下是播客转写文稿：\n\n${text}`;
    return callDeepSeek(SYSTEM_PROMPT, userPrompt, apiKey);
  }

  // Map-Reduce 兜底：分段提取要点 → 合并成文
  console.log(`[llm] 文稿超长（${text.length} 字符），走 Map-Reduce`);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_SINGLE_PASS_CHARS) {
    chunks.push(text.slice(i, i + MAX_SINGLE_PASS_CHARS));
  }
  const notes: string[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const note = await callDeepSeek(
      "你是播客文稿整理助手。请对以下文稿片段做忠实摘录：按时间顺序列出话题要点（带时间戳）、重要结论、值得原文保留的句子（带时间戳）。不得编造。",
      `文稿片段（第 ${i + 1}/${chunks.length} 段）：\n\n${chunk}`,
      apiKey,
    );
    notes.push(note);
  }
  return callDeepSeek(
    SYSTEM_PROMPT,
    `${strict ? "【重试】上一次输出缺少固定板块，这次必须完整输出五个板块。\n\n" : ""}以下是对一期超长播客分段提取的摘录笔记，请据此合并梳理成结构化文章（时间戳沿用笔记中的标注）：\n\n${notes.join("\n\n---\n\n")}`,
    apiKey,
  );
}

async function callDeepSeek(system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llmModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (res.status === 401) throw new Error("DeepSeek API Key 无效，请检查 .env 配置");
  if (res.status === 402 || res.status === 429) throw new Error("DeepSeek 余额不足或触发限流，请检查账户");
  if (!res.ok) throw new Error(`DeepSeek 调用失败（HTTP ${res.status}）`);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回为空");
  console.log(`[llm] 调用完成，tokens: ${json.usage?.total_tokens ?? "未知"}`);
  return content.trim();
}
