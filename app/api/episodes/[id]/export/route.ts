import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { marked } from "marked";
import { prisma } from "@/lib/prisma";
import type { Segment } from "@/lib/asr";
import {
  articleToDocx,
  articleToHtml,
  articleToTxt,
  transcriptToDocx,
  transcriptToJson,
  transcriptToMd,
  transcriptToSrt,
  transcriptToTxt,
} from "@/lib/export";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const ARTICLE_FORMATS = ["md", "html", "docx", "txt"];
const TRANSCRIPT_FORMATS = ["srt", "txt", "json", "md", "docx"];
const AUDIO_FORMATS = ["mp3", "wav", "m4a"];

/** 多格式导出：GET /api/episodes/[id]/export?part=article|transcript|audio&format=… */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const part = searchParams.get("part");
  const format = searchParams.get("format");

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { transcript: true, article: true },
  });
  if (!episode) return Response.json({ error: "任务不存在" }, { status: 404 });

  const title = episode.title ?? episode.sourceUrl ?? `任务 #${episode.id}`;
  const safeName = title.replace(/[\\/:*?"<>|]/g, "_");

  // 无参数 = 向后兼容：完整 Markdown（元信息 + 文章 + 附录文稿）
  if (!part && !format) {
    return textResponse(buildFullMarkdown(episode), `${safeName}.md`, "text/markdown");
  }

  if (part === "article") {
    if (!episode.article) return Response.json({ error: "还没有生成文章" }, { status: 400 });
    if (!format || !ARTICLE_FORMATS.includes(format)) {
      return Response.json({ error: `文章支持格式：${ARTICLE_FORMATS.join(" / ")}` }, { status: 400 });
    }
    const md = episode.article.contentMd;
    switch (format) {
      case "md":
        return textResponse(md, `${safeName}.md`, "text/markdown");
      case "txt":
        return textResponse(articleToTxt(md), `${safeName}.txt`, "text/plain");
      case "html": {
        const body = marked.parse(md, { async: false }) as string;
        return textResponse(articleToHtml(title, body), `${safeName}.html`, "text/html");
      }
      case "docx": {
        const buf = await articleToDocx(title, md);
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.docx`,
          },
        });
      }
    }
  }

  if (part === "transcript") {
    if (!episode.transcript) return Response.json({ error: "还没有文字稿" }, { status: 400 });
    if (!format || !TRANSCRIPT_FORMATS.includes(format)) {
      return Response.json({ error: `文稿支持格式：${TRANSCRIPT_FORMATS.join(" / ")}` }, { status: 400 });
    }
    const segments = parseSegments(episode.transcript.segments);
    // timestamps=0 关闭时间戳（srt 字幕除外，恒带时间轴）
    const withTimestamps = searchParams.get("timestamps") !== "0";
    switch (format) {
      case "srt":
        return textResponse(transcriptToSrt(segments), `${safeName}.srt`, "application/x-subrip");
      case "txt":
        return textResponse(
          transcriptToTxt(segments, { timestamps: withTimestamps }),
          `${safeName}.txt`,
          "text/plain",
        );
      case "json":
        return textResponse(transcriptToJson(segments), `${safeName}.json`, "application/json");
      case "md":
        return textResponse(
          transcriptToMd(segments, { timestamps: withTimestamps }),
          `${safeName}.md`,
          "text/markdown",
        );
      case "docx": {
        const buf = await transcriptToDocx(title, segments, { timestamps: withTimestamps });
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.docx`,
          },
        });
      }
    }
  }

  if (part === "audio") {
    if (!episode.audioPath) return Response.json({ error: "音频不存在" }, { status: 404 });
    if (!format || !AUDIO_FORMATS.includes(format)) {
      return Response.json({ error: `音频支持格式：${AUDIO_FORMATS.join(" / ")}` }, { status: 400 });
    }
    if (format === "mp3") {
      // 直接转发现有音频路由（带下载语义）
      return Response.redirect(
        new URL(`/api/episodes/${episodeId}/audio?download=1`, request.url),
        302,
      );
    }
    // wav / m4a：ffmpeg 实时转码 + 本地缓存
    const cachePath = path.join(process.cwd(), "audio", `${episodeId}.${format}`);
    try {
      await fs.access(cachePath);
    } catch {
      const args =
        format === "wav"
          ? ["-y", "-i", episode.audioPath, "-ar", "16000", "-ac", "1", cachePath]
          : ["-y", "-i", episode.audioPath, "-c:a", "aac", "-b:a", "64k", cachePath];
      try {
        await execFileAsync("ffmpeg", args, { timeout: 10 * 60 * 1000, windowsHide: true });
      } catch (err) {
        await fs.rm(cachePath, { force: true });
        return Response.json(
          { error: `转码失败：${err instanceof Error ? err.message : err}` },
          { status: 500 },
        );
      }
    }
    const stat = await fs.stat(cachePath);
    const stream = Readable.toWeb(createReadStream(cachePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": format === "wav" ? "audio/wav" : "audio/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.${format}`,
      },
    });
  }

  return Response.json({ error: "part 只支持 article / transcript / audio" }, { status: 400 });
}

function textResponse(content: string, fileName: string, contentType: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

function parseSegments(json: string): Segment[] {
  try {
    const arr = JSON.parse(json) as Segment[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

type EpisodeFull = NonNullable<Awaited<ReturnType<typeof loadEpisode>>>;
// 仅用于类型推导
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function loadEpisode(id: number) {
  return prisma.episode.findUnique({ where: { id }, include: { transcript: true, article: true } });
}

/** 完整 Markdown：元信息 + AI 文章 + 附录全文文稿（向后兼容的默认导出） */
function buildFullMarkdown(episode: EpisodeFull): string {
  const title = episode.title ?? episode.sourceUrl ?? `任务 #${episode.id}`;
  const duration = episode.durationSec ? `${Math.round(episode.durationSec / 60)} 分钟` : "未知";

  let md = `# ${title}\n\n`;
  md += `> 来源：${episode.sourceType === "link" ? episode.sourceUrl : "本地上传"}  \n`;
  md += `> 时长：${duration} · 处理时间：${episode.createdAt.toLocaleString("zh-CN")}  \n`;
  md += `> 由「播客转文字稿」工具生成\n\n---\n\n`;

  if (episode.article) md += `${episode.article.contentMd}\n\n---\n\n`;
  if (episode.transcript) {
    md += `## 附录：全文文字稿\n\n${transcriptToMd(parseSegments(episode.transcript.segments))}`;
  }
  return md;
}
