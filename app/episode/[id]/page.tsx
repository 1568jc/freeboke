import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Segment } from "@/lib/asr";
import { PlayerBar } from "./player-bar";
import { GuidePanel } from "./guide-panel";
import { MediaCard } from "./media-card";
import { parseChapters, parsePoints, parseQuotes, parseSummary } from "@/lib/chapters";
import { MainTabs } from "./main-tabs";

export const dynamic = "force-dynamic";

function parseSegments(json: string): Segment[] {
  try {
    const arr = JSON.parse(json) as Segment[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 15+ 起 params 是 Promise，必须 await
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) notFound();

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      transcript: true,
      article: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!episode) notFound();

  const segments = episode.transcript ? parseSegments(episode.transcript.segments) : [];
  const articleMd = episode.article?.contentMd ?? null;
  const chapters = articleMd ? parseChapters(articleMd) : [];
  const summary = articleMd ? parseSummary(articleMd) : null;
  const points = articleMd ? parsePoints(articleMd) : [];
  const quotes = articleMd ? parseQuotes(articleMd) : [];
  const hasAudio = episode.audioPath !== null;
  const processing = ["pending", "downloading", "transcribing", "summarizing"].includes(
    episode.status,
  );

  return (
    // 移动端播放条吸底，底部留白防遮挡
    <div className="max-md:pb-16">
      {/* ① 顶部吸顶迷你播放条 */}
      {hasAudio && <PlayerBar episodeId={episode.id} durationSec={episode.durationSec} />}

      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:px-10">
        {/* ② 左栏：媒体卡 + 导读（桌面端整体吸附，栏内独立滚动；移动端 媒体卡→Tab→导读） */}
        <div className="max-md:contents md:sticky md:top-20 md:flex md:max-h-[calc(100vh-96px)] md:w-80 md:shrink-0 md:flex-col md:gap-4 md:overflow-y-auto md:pb-1">
          <div className="max-md:order-1">
            <MediaCard
              episode={episode}
              articleMd={articleMd}
              hasAudio={hasAudio}
              hasTranscript={episode.transcript !== null}
            />
          </div>
          <div className="max-md:order-3">
            <GuidePanel summary={summary} chapters={chapters} points={points} quotes={quotes} />
          </div>
        </div>

        {/* ③ 主区：Tab 内容 */}
        <div className="min-w-0 flex-1 max-md:order-2">
          {processing && (
            <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              任务处理中，完成后内容自动出现…
            </p>
          )}

          <MainTabs
            episodeId={episode.id}
            articleMd={articleMd}
            segments={segments}
            hasTranscript={episode.transcript !== null}
            initialMessages={episode.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
