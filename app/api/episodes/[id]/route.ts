import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** 查询任务状态（前端 2s 轮询用） */
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

  return Response.json({
    id: episode.id,
    title: episode.title,
    status: episode.status,
    errorMsg: episode.errorMsg,
    durationSec: episode.durationSec,
    hasTranscript: episode.transcript !== null,
    hasArticle: episode.article !== null,
    createdAt: episode.createdAt,
    downloadedAt: episode.downloadedAt,
    transcribedAt: episode.transcribedAt,
    summarizedAt: episode.summarizedAt,
  });
}
