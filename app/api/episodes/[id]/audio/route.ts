import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** 音频流服务：在线播放（支持 Range 拖动）+ ?download=1 下载 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode?.audioPath) return new Response("音频不存在", { status: 404 });

  let fileSize: number;
  try {
    fileSize = (await fs.stat(episode.audioPath)).size;
  } catch {
    return new Response("音频文件已不存在", { status: 404 });
  }

  const isDownload = new URL(request.url).searchParams.get("download") === "1";
  const fileName = `${(episode.title ?? `episode-${episode.id}`).replace(/[\\/:*?"<>|]/g, "_")}.mp3`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    ...(isDownload
      ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` }
      : {}),
  };

  // Range 请求（<audio> 拖进度条依赖）
  const range = request.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), fileSize - 1) : fileSize - 1;
      if (start >= fileSize || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
      }
      const stream = Readable.toWeb(
        createReadStream(episode.audioPath, { start, end }),
      ) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(episode.audioPath)) as ReadableStream;
  return new Response(stream, {
    headers: { ...baseHeaders, "Content-Length": String(fileSize) },
  });
}
