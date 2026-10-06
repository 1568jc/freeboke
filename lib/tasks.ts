import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "./prisma";
import { startTranscription } from "./asr";

const execFileAsync = promisify(execFile);

export const AUDIO_DIR = path.join(process.cwd(), "audio");
export const MAX_DURATION_SEC = 6 * 3600; // 单集时长上限 6 小时
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 下载超时 30 分钟

// 进程内记录运行中的任务，防止同一集重复触发（dev 热重载下用 globalThis 兜底）
const globalForTasks = globalThis as unknown as { runningTasks?: Set<number> };
const running = (globalForTasks.runningTasks ??= new Set<number>());

/** 是否已有任务在进行（单任务串行约束） */
export async function hasActiveTask(): Promise<boolean> {
  const count = await prisma.episode.count({
    where: { status: { in: ["pending", "downloading"] } },
  });
  return count > 0;
}

/** fire-and-forget 启动下载任务 */
export function startDownload(episodeId: number, url: string): void {
  if (running.has(episodeId)) return;
  running.add(episodeId);
  void runDownload(episodeId, url)
    .catch(() => undefined) // runDownload 内部已落库，这里兜底防未捕获拒绝
    .finally(() => running.delete(episodeId));
}

async function runDownload(episodeId: number, url: string): Promise<void> {
  const fail = async (errorMsg: string) => {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "failed", errorMsg },
    });
  };

  try {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    const outTemplate = path.join(AUDIO_DIR, `${episodeId}.%(ext)s`);

    let title: string | undefined;
    let durationSec: number | undefined;
    let rawFile: string | undefined;

    try {
      // B 站 2026-06 起对无 Origin/Referer 的 yt-dlp 请求返回 412 风控，补匿名浏览器头即可（无需登录态）
      const isBilibili = /bilibili\.com|b23\.tv/i.test(url);
      const ytArgs = ["-x", "--audio-format", "mp3", "--no-playlist", "--print-json"];
      if (isBilibili) {
        ytArgs.push(
          "--add-header", "Origin: https://www.bilibili.com",
          "--add-header", "Referer: https://www.bilibili.com",
        );
      }
      ytArgs.push("-o", outTemplate, url);
      const { stdout } = await execFileAsync("yt-dlp", ytArgs, {
        timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
      });
      // --print-json 每个视频输出一行 JSON；--no-playlist 下只有一行
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
      const info = lastLine ? (JSON.parse(lastLine) as Record<string, unknown>) : {};
      title = typeof info.title === "string" ? info.title : undefined;
      durationSec = typeof info.duration === "number" ? Math.round(info.duration) : undefined;
      rawFile = path.join(AUDIO_DIR, `${episodeId}.mp3`);
    } catch (err) {
      // yt-dlp 失败：诊断原因，并按"og:audio 页面音频 → 音频直链"顺序降级
      const stderr = extractStderr(err);
      const reason = classifyYtdlpError(stderr);
      if (reason.kind === "unsupported") {
        const pageAudio = await resolveViaPageAudio(url);
        const audioUrl = pageAudio?.audioUrl ?? ((await isAudioDirectLink(url)) ? url : null);
        if (audioUrl) {
          const direct = await directDownload(episodeId, audioUrl);
          durationSec = pageAudio?.durationSec ?? direct.durationSec;
          rawFile = direct.filePath;
          title = pageAudio?.title ?? (decodeURIComponent(path.basename(new URL(audioUrl).pathname)) || undefined);
        } else {
          await fail("该站点暂不支持解析，且页面中未找到音频地址");
          return;
        }
      } else {
        await fail(reason.message);
        return;
      }
    }

    if (!rawFile) {
      await fail("下载失败：未找到下载产物");
      return;
    }

    if (durationSec === undefined) {
      durationSec = await probeDuration(rawFile);
    }
    if (durationSec !== undefined && durationSec > MAX_DURATION_SEC) {
      await fs.rm(rawFile, { force: true });
      await fail(`单集时长 ${Math.round(durationSec / 60)} 分钟，超过 6 小时上限`);
      return;
    }

    // 统一转码为 16kHz 单声道 mp3（ASR 友好、体积最小）
    const finalFile = await transcodeTo16kMono(rawFile);

    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        title: title ?? null,
        durationSec: durationSec ?? null,
        audioPath: finalFile,
        status: "transcribing",
        downloadedAt: new Date(),
      },
    });
    startTranscription(episodeId);
  } catch (err) {
    await fail(`下载失败：${err instanceof Error ? err.message : String(err)}`.slice(0, 500));
  }
}

type FailReason = { kind: "unsupported" | "auth" | "network" | "timeout" | "other"; message: string };

function extractStderr(err: unknown): string {
  if (typeof err === "object" && err !== null && "stderr" in err) {
    return String((err as { stderr: unknown }).stderr ?? "");
  }
  return err instanceof Error ? err.message : String(err);
}

/** 把 yt-dlp 的 stderr 归类为用户可读的原因 */
export function classifyYtdlpError(stderr: string): FailReason {
  const s = stderr.toLowerCase();
  const firstLine = stderr.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "";
  const detail = firstLine.replace(/^error:\s*/i, "").slice(0, 200);

  if (s.includes("unsupported url") || s.includes("no suitable infoextractor")) {
    return { kind: "unsupported", message: "该站点暂不支持解析（已尝试的站点列表见 yt-dlp 文档）" };
  }
  if (s.includes("fresh cookies")) {
    // yt-dlp 对抖音等站点的固定报错：需要浏览器 JS 挑战生成的指纹 cookie，纯 HTTP 不可行
    return { kind: "auth", message: "该站点启用了浏览器级风控（如抖音 Argus），暂不支持直链下载" };
  }
  if (
    s.includes("sign in") || s.includes("login") || s.includes("cookies") ||
    s.includes("private") || s.includes("drm") || s.includes("only available for registered")
  ) {
    return { kind: "auth", message: "该内容需要登录或有版权保护，按版权红线不做绕过" };
  }
  if (s.includes("timed out") || s.includes("timeout")) {
    return { kind: "timeout", message: "下载超时（30 分钟上限），请检查网络后重试" };
  }
  if (s.includes("404")) {
    return { kind: "network", message: "页面不存在或链接已失效（404），请确认链接复制完整" };
  }
  if (
    s.includes("resolve") || s.includes("unreachable") || s.includes("connection") ||
    s.includes("getaddrinfo") || s.includes("403")
  ) {
    return { kind: "network", message: `网络错误：${detail || "目标不可达"}` };
  }
  return { kind: "other", message: detail ? `下载失败：${detail}` : "下载失败：未知原因" };
}

/** HEAD 探测是否为音频直链 */
async function isAudioDirectLink(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("audio/")) return true;
    return /\.(mp3|m4a|wav)(\?|#|$)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * 页面音频降级：抓取网页 HTML，提取 og:audio 音频地址（覆盖小宇宙单集等 SSR 页面）。
 * 同时尽力带出 og:title 标题与 duration 时长（秒）。
 */
async function resolveViaPageAudio(
  url: string,
): Promise<{ audioUrl: string; title?: string; durationSec?: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    const html = await res.text();

    const metaOf = (prop: string): string | undefined => {
      const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i"))?.[0];
      return tag?.match(/content=["']([^"']+)["']/i)?.[1];
    };
    const audioUrl = metaOf("og:audio");
    if (!audioUrl) return null;

    const title = metaOf("og:title");
    const durationRaw = html.match(/"duration"\s*:\s*(\d+)/)?.[1];
    const durationSec = durationRaw ? Number(durationRaw) : undefined;
    return { audioUrl, title, durationSec: durationSec && Number.isFinite(durationSec) ? durationSec : undefined };
  } catch {
    return null;
  }
}

/** 音频直链降级：直接 HTTP 下载到本地 */
async function directDownload(
  episodeId: number,
  url: string,
): Promise<{ filePath: string; durationSec?: number }> {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const suffix = [".mp3", ".m4a", ".wav"].includes(ext) ? ext : ".mp3";
  const filePath = path.join(AUDIO_DIR, `${episodeId}${suffix}`);

  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`直链下载失败：HTTP ${res.status}`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_FILE_SIZE) throw new Error("文件超过 500MB 上限");

  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(filePath));
  return { filePath, durationSec: await probeDuration(filePath) };
}

/** ffprobe 读取音频时长（秒），失败返回 undefined */
export async function probeDuration(filePath: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { timeout: 60_000, windowsHide: true },
    );
    const sec = Number(stdout.trim());
    return Number.isFinite(sec) ? Math.round(sec) : undefined;
  } catch {
    return undefined;
  }
}

/** ffmpeg 转码为 16kHz 单声道 mp3，返回最终文件路径 */
export async function transcodeTo16kMono(srcPath: string): Promise<string> {
  const finalPath = path.join(AUDIO_DIR, `${path.basename(srcPath, path.extname(srcPath))}-16k.mp3`);
  if (srcPath === finalPath) return srcPath;
  await execFileAsync(
    "ffmpeg",
    ["-y", "-i", srcPath, "-ar", "16000", "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "4", finalPath],
    { timeout: 10 * 60 * 1000, windowsHide: true },
  );
  await fs.rm(srcPath, { force: true });
  return finalPath;
}
