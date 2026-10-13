"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Captions, FileText, MessageSquare } from "lucide-react";
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
  const [tab, setTab] = useState<"article" | "transcript" | "chat">("transcript");

  const tabs = [
    ["transcript", "全文文稿", Captions],
    ["article", "梳理文章", FileText],
    ["chat", "对话", MessageSquare],
  ] as const;

  return (
    <div>
      <div className="mb-4 flex gap-4 border-b border-line">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2 text-sm transition-colors ${
              tab === key
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-sub hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-paper p-6 shadow-[0_1px_4px_rgba(31,35,41,0.04)]">
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
    </div>
  );
}
