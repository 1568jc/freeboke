import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Segment } from "@/lib/asr";
import { StatusPoll } from "./status-poll";
import { EpisodeActions } from "./actions";
import { PlayerBar } from "./player-bar";
import { ChapterNav } from "./chapter-nav";
import { parseChapters } from "@/lib/chapters";
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
  const chapters = episode.article ? parseChapters(episode.article.contentMd) : [];
  const hasAudio = episode.audioPath !== null;
  const processing = ["pending", "downloading", "transcribing", "summarizing"].includes(
    episode.status,
  );

  return (
    // 移动端播放条吸底，底部留白防遮挡
    <div className="max-md:pb-16">
      {/* ① 顶部吸顶迷你播放条 */}
      {hasAudio && <PlayerBar episodeId={episode.id} durationSec={episode.durationSec} />}

      <div className="mx-auto flex max-w-[1500px] items-start gap-6 px-10 py-6">
        {/* ② 左侧章节速览栏 */}
        <ChapterNav chapters={chapters} />

        {/* ③ 主区 */}
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">
                {episode.title ?? episode.sourceUrl ?? `任务 #${episode.id}`}
              </h1>
              <p className="mt-1 text-xs text-weak">
                {episode.sourceType === "link" ? episode.sourceUrl : "本地上传"}
                {episode.durationSec ? ` · ${Math.round(episode.durationSec / 60)} 分钟` : ""}
                {` · 处理于 ${episode.createdAt.toLocaleString("zh-CN")}`}
              </p>
              <StatusPoll
                episodeId={episode.id}
                initialStatus={episode.status}
                initialErrorMsg={episode.errorMsg}
                initialTimes={{
                  createdAt: episode.createdAt.toISOString(),
                  downloadedAt: episode.downloadedAt?.toISOString() ?? null,
                  transcribedAt: episode.transcribedAt?.toISOString() ?? null,
                  summarizedAt: episode.summarizedAt?.toISOString() ?? null,
                }}
              />
            </div>
            <EpisodeActions
              episodeId={episode.id}
              articleMd={episode.article?.contentMd ?? null}
              hasAudio={hasAudio}
              hasTranscript={episode.transcript !== null}
            />
          </div>

          {processing && (
            <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              任务处理中，完成后内容自动出现…
            </p>
          )}

          <MainTabs
            episodeId={episode.id}
            articleMd={episode.article?.contentMd ?? null}
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
