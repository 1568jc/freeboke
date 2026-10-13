"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Segment } from "@/lib/asr";

function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Paragraph = { start: number; end: number; text: string };

/** 短句合并为阅读段落：间隔 >2s 或累计超 ~120 字即换段（通义听悟式段落布局） */
function groupSegments(segments: Segment[]): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const seg of segments) {
    const last = paras[paras.length - 1];
    const gap = last ? seg.start - last.end : Infinity;
    if (last && gap <= 2 && last.text.length < 120) {
      last.end = seg.end;
      last.text += seg.text;
    } else {
      paras.push({ start: seg.start, end: seg.end, text: seg.text });
    }
  }
  return paras;
}

/** 全文文稿视图：段落式布局；段首时间戳 chip 可点击跳转；当前段 = 浅蓝底 + 左 3px 竖线 */
export function TranscriptView({ segments }: { segments: Segment[] }) {
  const paragraphs = useMemo(() => groupSegments(segments), [segments]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // 播放进度（来自播放条广播）→ 高亮当前段
  useEffect(() => {
    const onTime = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      let idx = -1;
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].start <= t) idx = i;
        else break;
      }
      setActiveIdx(idx);
    };
    window.addEventListener("episode:timeupdate", onTime);
    return () => window.removeEventListener("episode:timeupdate", onTime);
  }, [paragraphs]);

  // 高亮段滚动到可视区（只在栏内滚动）
  useEffect(() => {
    if (activeIdx < 0) return;
    listRef.current
      ?.querySelector(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  const seek = (sec: number) =>
    window.dispatchEvent(new CustomEvent("episode:seek", { detail: sec }));

  return (
    <div ref={listRef} className="space-y-3 overflow-y-auto pr-2">
      {paragraphs.map((para, i) => (
        <div
          key={i}
          data-idx={i}
          className={`group cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
            i === activeIdx
              ? "border-l-[3px] border-brand bg-highlight"
              : "border-l-[3px] border-transparent hover:bg-line/30"
          }`}
          onClick={() => seek(para.start)}
        >
          <span
            className={`mb-1 inline-block rounded px-1.5 py-0.5 font-mono text-xs leading-4 transition-colors ${
              i === activeIdx
                ? "bg-brand text-white"
                : "bg-highlight text-brand group-hover:bg-brand group-hover:text-white"
            }`}
          >
            {formatTime(para.start)}
          </span>
          <p className="text-base leading-7">{para.text}</p>
        </div>
      ))}
    </div>
  );
}
