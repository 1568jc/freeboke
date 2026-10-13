"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ARTICLE_FORMATS = ["docx", "md", "txt", "html", "pdf"] as const;
const TRANSCRIPT_FORMATS = ["docx", "srt", "txt", "md"] as const;
const AUDIO_FORMATS = ["mp3", "wav", "m4a"] as const;

/** 触发一次浏览器下载（文件名由响应头 Content-Disposition 决定） */
function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const selectCls =
  "rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-brand";

/** 导出对话框：勾选内容（文章/文稿/音频）+ 格式选择 + 显示信息，逐个下载 */
export function ExportDialog({
  episodeId,
  hasArticle,
  hasTranscript,
  hasAudio,
}: {
  episodeId: number;
  hasArticle: boolean;
  hasTranscript: boolean;
  hasAudio: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [wantArticle, setWantArticle] = useState(hasArticle);
  const [wantTranscript, setWantTranscript] = useState(false);
  const [wantAudio, setWantAudio] = useState(false);
  const [articleFmt, setArticleFmt] = useState<(typeof ARTICLE_FORMATS)[number]>("docx");
  const [transcriptFmt, setTranscriptFmt] =
    useState<(typeof TRANSCRIPT_FORMATS)[number]>("docx");
  const [audioFmt, setAudioFmt] = useState<(typeof AUDIO_FORMATS)[number]>("mp3");
  const [withTimestamps, setWithTimestamps] = useState(true);

  const canExport = wantArticle || wantTranscript || wantAudio;

  const onExport = () => {
    const base = `/api/episodes/${episodeId}/export`;
    const jobs: string[] = [];
    if (wantArticle) {
      // pdf 走打印页（浏览器另存为 PDF）
      if (articleFmt === "pdf") window.open(`/episode/${episodeId}/print`, "_blank");
      else jobs.push(`${base}?part=article&format=${articleFmt}`);
    }
    if (wantTranscript) {
      jobs.push(
        `${base}?part=transcript&format=${transcriptFmt}${withTimestamps ? "" : "&timestamps=0"}`,
      );
    }
    if (wantAudio) jobs.push(`${base}?part=audio&format=${audioFmt}`);
    // 逐个触发，小间隔避免浏览器拦截多文件下载
    jobs.forEach((url, i) => setTimeout(() => download(url), i * 300));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-sub hover:bg-line/40">
          <Download className="h-3.5 w-3.5" />
          导出
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导出</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* AI 文章 */}
          <div className={hasArticle ? "" : "opacity-40"}>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                disabled={!hasArticle}
                checked={wantArticle}
                onChange={(e) => setWantArticle(e.target.checked)}
              />
              AI 文章
            </label>
            {wantArticle && hasArticle && (
              <div className="mt-2 flex items-center justify-between pl-6 text-xs text-sub">
                <span>文档格式</span>
                <select
                  className={selectCls}
                  value={articleFmt}
                  onChange={(e) =>
                    setArticleFmt(e.target.value as (typeof ARTICLE_FORMATS)[number])
                  }
                >
                  {ARTICLE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      .{f}
                      {f === "pdf" ? "（浏览器打印）" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 全文文稿 */}
          <div className={hasTranscript ? "" : "opacity-40"}>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                disabled={!hasTranscript}
                checked={wantTranscript}
                onChange={(e) => setWantTranscript(e.target.checked)}
              />
              全文文稿
            </label>
            {wantTranscript && hasTranscript && (
              <div className="mt-2 space-y-2 pl-6 text-xs text-sub">
                <div className="flex items-center justify-between">
                  <span>文档格式</span>
                  <select
                    className={selectCls}
                    value={transcriptFmt}
                    onChange={(e) =>
                      setTranscriptFmt(e.target.value as (typeof TRANSCRIPT_FORMATS)[number])
                    }
                  >
                    {TRANSCRIPT_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        .{f}
                      </option>
                    ))}
                  </select>
                </div>
                {transcriptFmt !== "srt" && (
                  <div className="flex items-center justify-between">
                    <span>显示信息</span>
                    <label className="flex items-center gap-1.5 text-xs text-ink">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-brand"
                        checked={withTimestamps}
                        onChange={(e) => setWithTimestamps(e.target.checked)}
                      />
                      时间戳
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 音频 */}
          <div className={hasAudio ? "" : "opacity-40"}>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                disabled={!hasAudio}
                checked={wantAudio}
                onChange={(e) => setWantAudio(e.target.checked)}
              />
              音频
            </label>
            {wantAudio && hasAudio && (
              <div className="mt-2 flex items-center justify-between pl-6 text-xs text-sub">
                <span>格式</span>
                <select
                  className={selectCls}
                  value={audioFmt}
                  onChange={(e) => setAudioFmt(e.target.value as (typeof AUDIO_FORMATS)[number])}
                >
                  {AUDIO_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      .{f}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-line px-4 py-1.5 text-xs text-sub hover:bg-line/40"
          >
            取消
          </button>
          <button
            onClick={onExport}
            disabled={!canExport}
            className="rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-paper hover:opacity-85 disabled:opacity-40"
          >
            导出
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
