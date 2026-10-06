import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/export";
import type { Segment } from "@/lib/asr";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/** 打印友好页：PDF 出口（浏览器另存为 PDF） */
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) notFound();

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { transcript: true, article: true },
  });
  if (!episode) notFound();

  let segments: Segment[] = [];
  try {
    if (episode.transcript) segments = JSON.parse(episode.transcript.segments);
  } catch {
    segments = [];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="no-print mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-800">
          点击右侧按钮，在打印对话框中选择「另存为 PDF」即可导出 PDF
        </p>
        <PrintButton />
      </div>

      <article className="prose prose-neutral max-w-none">
        <h1>{episode.title ?? episode.sourceUrl ?? `任务 #${episode.id}`}</h1>
        <p className="text-sm text-neutral-500">
          来源：{episode.sourceType === "link" ? episode.sourceUrl : "本地上传"} · 时长：
          {episode.durationSec ? `${Math.round(episode.durationSec / 60)} 分钟` : "未知"} ·
          处理时间：{episode.createdAt.toLocaleString("zh-CN")}
        </p>
        <hr />
        {episode.article && <ReactMarkdown>{episode.article.contentMd}</ReactMarkdown>}
        {segments.length > 0 && (
          <>
            <hr />
            <h2>附录：全文文字稿</h2>
            {segments.map((s, i) => (
              <p key={i}>
                <strong className="text-neutral-400">[{formatTime(s.start)}]</strong> {s.text}
              </p>
            ))}
          </>
        )}
      </article>
    </div>
  );
}
