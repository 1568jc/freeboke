import { prisma } from "@/lib/prisma";
import { startTranscription } from "@/lib/asr";

export const runtime = "nodejs";

/** 手动触发/重试转写（长任务中断恢复入口） */
export async function POST(
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
  if (!episode.audioPath) {
    return Response.json({ error: "没有可转写的音频文件" }, { status: 400 });
  }
  if (["pending", "downloading", "transcribing", "summarizing"].includes(episode.status)) {
    return Response.json({ error: "任务正在处理中，请勿重复触发" }, { status: 409 });
  }

  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "transcribing", errorMsg: null },
  });
  startTranscription(episodeId);

  return Response.json({ ok: true });
}
