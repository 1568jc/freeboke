"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GROUPS: Array<{ label: string; part: string; formats: string[] }> = [
  { label: "AI 文章", part: "article", formats: ["md", "docx", "txt"] },
  { label: "文稿", part: "transcript", formats: ["srt", "txt"] },
  { label: "音频", part: "audio", formats: ["mp3"] },
];

/** 操作区：复制全文 + 导出图标下拉（分组） */
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

  const groups = GROUPS.filter(
    (g) =>
      (g.part !== "article" || articleMd) &&
      (g.part !== "transcript" || hasTranscript) &&
      (g.part !== "audio" || hasAudio),
  );

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyArticle}
        disabled={!articleMd}
        className="rounded-lg px-3 py-1.5 text-xs text-sub hover:bg-line/40 disabled:opacity-40"
      >
        {copied ? "已复制 ✓" : "复制全文"}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-lg p-2 text-sub hover:bg-line/40"
            title="导出"
            aria-label="导出"
          >
            <Download className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {groups.map((g, gi) => (
            <div key={g.part}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-weak">
                  {g.label}
                </DropdownMenuLabel>
                {g.formats.map((fmt) => (
                  <DropdownMenuItem key={fmt} asChild>
                    <a
                      href={`/api/episodes/${episodeId}/export?part=${g.part}&format=${fmt}`}
                      download
                      className="cursor-pointer uppercase"
                    >
                      {fmt}
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
