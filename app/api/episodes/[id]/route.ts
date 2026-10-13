import { prisma } from "@/lib/prisma";
import { AUDIO_DIR, isDownloadRunning } from "@/lib/tasks";
import { isTranscribing } from "@/lib/asr";
import { isSummarizing } from "@/lib/llm";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** 查询任务状态（前端 2s 轮询用）；alive=false 表示状态停在中途但进程内没有任务在跑（服务重启残留） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // Next 15+ 起 params 是 Promise
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { transcript: true, article: true },
  });
  if (!episode) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }

  const alive =
    episode.status === "pending" || episode.status === "downloading"
      ? isDownloadRunning(episode.id)
      : episode.status === "transcribing"
        ? isTranscribing(episode.id)
        : episode.status === "summarizing"
          ? isSummarizing(episode.id)
          : true;

  return Response.json({
    id: episode.id,
    title: episode.title,
    status: episode.status,
    errorMsg: episode.errorMsg,
    durationSec: episode.durationSec,
    hasTranscript: episode.transcript !== null,
    hasArticle: episode.article !== null,
    alive,
    createdAt: episode.createdAt,
    downloadedAt: episode.downloadedAt,
    transcribedAt: episode.transcribedAt,
    summarizedAt: episode.summarizedAt,
  });
}

/** 删除任务：关联记录（文稿/文章/对话）+ 磁盘音频文件一并清除；处理中的活任务拒绝删除 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) return Response.json({ error: "任务不存在" }, { status: 404 });

  if (
    isDownloadRunning(episodeId) ||
    isTranscribing(episodeId) ||
    isSummarizing(episodeId)
  ) {
    return Response.json({ error: "任务正在处理中，完成或中断后再删除" }, { status: 409 });
  }

  // 数据库：手动清关联（schema 未配级联）
  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { episodeId } }),
    prisma.transcript.deleteMany({ where: { episodeId } }),
    prisma.article.deleteMany({ where: { episodeId } }),
    prisma.episode.delete({ where: { id: episodeId } }),
  ]);

  // 磁盘：音频本体 + 导出转码缓存 + 下载残留（best-effort）
  const files = [
    episode.audioPath,
    path.join(AUDIO_DIR, `${episodeId}.wav`),
    path.join(AUDIO_DIR, `${episodeId}.m4a`),
    path.join(AUDIO_DIR, `${episodeId}.mp3`),
    path.join(AUDIO_DIR, `${episodeId}.m4a.part`),
  ].filter((f): f is string => typeof f === "string");
  await Promise.all(files.map((f) => fs.rm(f, { force: true }).catch(() => undefined)));

  return Response.json({ ok: true });
}
