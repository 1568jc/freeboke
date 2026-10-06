"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Segment } from "@/lib/asr";
import { TranscriptView } from "./transcript-view";
import { ChatPanel } from "./chat-panel";

/** 主区 Tab：梳理文章 / 全文文稿 / 对话（全部常驻挂载，CSS 切换，状态不丢） */
export function MainTabs({
  episodeId,
  articleMd,
  segments,
  hasTranscript,
  initialMessages,
}: {
  episodeId: number;
  articleMd: string | null;
  segments: Segment[];
  hasTranscript: boolean;
  initialMessages: Array<{ id: number; role: string; content: string }>;
}) {
  const [tab, setTab] = useState<"article" | "transcript" | "chat">("article");

  const tabs = [
    ["article", "梳理文章"],
    ["transcript", "全文文稿"],
    ["chat", "对话"],
  ] as const;

  return (
    <div>
      <div className="mb-4 flex gap-4 border-b border-line">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-1 py-2 text-sm ${
              tab === key
                ? "border-brand font-semibold text-ink"
                : "border-transparent text-sub hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "article" ? "" : "hidden"}>
        {articleMd ? (
          <div className="prose mx-auto max-w-[720px]">
            <ReactMarkdown>{articleMd}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-weak">尚未生成，梳理完成后展示</p>
        )}
      </div>

      <div className={tab === "transcript" ? "" : "hidden"}>
        {segments.length > 0 ? (
          <TranscriptView segments={segments} />
        ) : (
          <p className="text-sm text-neutral-500">尚未生成，转写完成后展示</p>
        )}
      </div>

      <div className={tab === "chat" ? "" : "hidden"}>
        <ChatPanel
          episodeId={episodeId}
          hasTranscript={hasTranscript}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}
