"use client";

import { useState } from "react";
import { ExportDialog } from "./export-dialog";

/** 操作区：复制全文 + 导出对话框 */
export function EpisodeActions({
  episodeId,
  articleMd,
  hasAudio,
  hasTranscript,
}: {
  episodeId: number;
  articleMd: string | null;
  hasAudio: boolean;
  hasTranscript: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyArticle = async () => {
    if (!articleMd) return;
    try {
      await navigator.clipboard.writeText(articleMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("复制失败，请手动选择文本复制");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyArticle}
        disabled={!articleMd}
        className="rounded-lg px-3 py-1.5 text-xs text-sub hover:bg-line/40 disabled:opacity-40"
      >
        {copied ? "已复制 ✓" : "复制全文"}
      </button>
      <ExportDialog
        episodeId={episodeId}
        hasArticle={articleMd !== null}
        hasTranscript={hasTranscript}
        hasAudio={hasAudio}
      />
    </div>
  );
}
