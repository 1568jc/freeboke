import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteEpisodeButton } from "./delete-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  downloading: "下载中",
  transcribing: "转写中",
  summarizing: "梳理中",
  done: "完成",
  failed: "失败",
};

export default async function HistoryPage() {
  const episodes = await prisma.episode.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-xl font-bold">历史记录</h1>

      {episodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-sm text-sub">
          暂无记录，去<Link href="/" className="underline">首页</Link>处理第一期播客吧
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper shadow-[0_1px_4px_rgba(31,35,41,0.04)]">
          {episodes.map((ep) => (
            <li key={ep.id} className="flex items-center transition-colors hover:bg-line/30">
              <Link
                href={`/episode/${ep.id}`}
                className="flex min-w-0 flex-1 items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {ep.title ?? ep.sourceUrl ?? `任务 #${ep.id}`}
                  </p>
                  <p className="text-xs text-sub">
                    {ep.createdAt.toLocaleString("zh-CN")}
                    {ep.durationSec ? ` · ${Math.round(ep.durationSec / 60)} 分钟` : ""}
                    {ep.status === "failed" && ep.errorMsg
                      ? ` · ${ep.errorMsg}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`ml-4 shrink-0 text-xs ${
                    ep.status === "done"
                      ? "text-ink"
                      : ep.status === "failed"
                        ? "text-ink underline decoration-wavy"
                        : "text-sub"
                  }`}
                >
                  {STATUS_LABEL[ep.status] ?? ep.status}
                </span>
              </Link>
              <span className="pr-3">
                <DeleteEpisodeButton
                  episodeId={ep.id}
                  title={ep.title ?? ep.sourceUrl ?? `任务 #${ep.id}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
