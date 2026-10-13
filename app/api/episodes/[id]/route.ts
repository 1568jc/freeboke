import { prisma } from "@/lib/prisma";
import { isDownloadRunning } from "@/lib/tasks";
import { isTranscribing } from "@/lib/asr";
import { isSummarizing } from "@/lib/llm";

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
