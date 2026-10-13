import { AudioLines } from "lucide-react";
import { StatusPoll } from "./status-poll";
import { EpisodeActions } from "./actions";

function fmtDuration(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

type EpisodeLite = {
  id: number;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  durationSec: number | null;
  status: string;
  errorMsg: string | null;
  createdAt: Date;
  downloadedAt: Date | null;
  transcribedAt: Date | null;
  summarizedAt: Date | null;
};

/** 左栏媒体卡：封面（渐变+音频图标+时长角标）+ 标题/来源/状态 + 操作（复制全文/导出） */
export function MediaCard({
  episode,
  articleMd,
  hasAudio,
  hasTranscript,
}: {
  episode: EpisodeLite;
  articleMd: string | null;
  hasAudio: boolean;
  hasTranscript: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-paper shadow-[0_1px_4px_rgba(31,35,41,0.04)]">
      {/* 封面区：无音频封面图，用品牌渐变 + 音频图标代替 */}
      <div className="relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-brand/70 to-brand/40">
        <AudioLines className="h-12 w-12 text-white/90" aria-hidden="true" />
        {episode.durationSec ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-xs text-white">
            {fmtDuration(episode.durationSec)}
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <h1 className="text-base font-semibold leading-6">
          {episode.title ?? episode.sourceUrl ?? `任务 #${episode.id}`}
        </h1>
        <p className="mt-1 break-all text-xs text-weak">
          {episode.sourceType === "link" ? episode.sourceUrl : "本地上传"}
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
        <div className="mt-3 border-t border-line pt-3">
          <EpisodeActions
            episodeId={episode.id}
            articleMd={articleMd}
            hasAudio={hasAudio}
            hasTranscript={hasTranscript}
          />
        </div>
      </div>
    </section>
  );
}
