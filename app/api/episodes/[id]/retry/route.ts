import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { isDownloadRunning, startDownload } from "@/lib/tasks";
import { isTranscribing, startTranscription } from "@/lib/asr";
import { isSummarizing, startSummarization } from "@/lib/llm";

export const runtime = "nodejs";

/** 中断恢复：从正确的环节继续（进程重启后状态机残留时用）。
 *  有音频 → 续转写；有文稿 → 续梳理；都没有 → 重新下载（仅链接任务）。 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { transcript: true, article: true },
  });
  if (!episode) return Response.json({ error: "任务不存在" }, { status: 404 });

  // 进程内真的在跑的任务不允许重复触发
  const actuallyRunning =
    (["pending", "downloading"].includes(episode.status) && isDownloadRunning(episodeId)) ||
    (episode.status === "transcribing" && isTranscribing(episodeId)) ||
    (episode.status === "summarizing" && isSummarizing(episodeId));
  if (actuallyRunning) {
    return Response.json({ error: "任务正在处理中，请勿重复触发" }, { status: 409 });
  }
  if (episode.status === "done" && episode.article) {
    return Response.json({ error: "任务已完成，无需重试" }, { status: 400 });
  }

  const hasAudioFile =
    episode.audioPath !== null &&
    (await fs.access(episode.audioPath).then(() => true, () => false));

  // 有音频但缺文稿 → 续转写；有文稿但缺文章 → 续梳理
  if (hasAudioFile && !episode.transcript) {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "transcribing", errorMsg: null },
    });
    startTranscription(episodeId);
    return Response.json({ ok: true, status: "transcribing" });
  }
  if (hasAudioFile && episode.transcript && !episode.article) {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "summarizing", errorMsg: null },
    });
    startSummarization(episodeId);
    return Response.json({ ok: true, status: "summarizing" });
  }

  // 没有音频：链接任务重新下载；上传任务文件丢了只能重来
  if (episode.sourceType === "link" && episode.sourceUrl) {
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "downloading", errorMsg: null },
    });
    startDownload(episodeId, episode.sourceUrl);
    return Response.json({ ok: true, status: "downloading" });
  }
  return Response.json({ error: "音频文件已丢失，请回到首页重新上传" }, { status: 400 });
}
