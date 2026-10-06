import { prisma } from "@/lib/prisma";
import { startSummarization } from "@/lib/llm";

export const runtime = "nodejs";

/** 手动触发/重试梳理（要求已有文字稿） */
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
    include: { transcript: true },
  });
  if (!episode) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (!episode.transcript) {
    return Response.json({ error: "还没有文字稿，请先完成转写" }, { status: 400 });
  }
  if (["pending", "downloading", "transcribing", "summarizing"].includes(episode.status)) {
    return Response.json({ error: "任务正在处理中，请勿重复触发" }, { status: 409 });
  }

  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "summarizing", errorMsg: null },
  });
  startSummarization(episodeId);

  return Response.json({ ok: true });
}
