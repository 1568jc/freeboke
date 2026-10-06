"use client";

import { useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/asr";

function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 全文文稿视图：12px 灰色时间戳可点击跳转；当前句 = 浅灰底 + 左 3px 竖线 */
export function TranscriptView({ segments }: { segments: Segment[] }) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // 播放进度（来自播放条广播）→ 高亮当前句
  useEffect(() => {
    const onTime = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      let idx = -1;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].start <= t) idx = i;
        else break;
      }
      setActiveIdx(idx);
    };
    window.addEventListener("episode:timeupdate", onTime);
    return () => window.removeEventListener("episode:timeupdate", onTime);
  }, [segments]);

  // 高亮句滚动到可视区（只在栏内滚动）
  useEffect(() => {
    if (activeIdx < 0) return;
    listRef.current
      ?.querySelector(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  const seek = (sec: number) =>
    window.dispatchEvent(new CustomEvent("episode:seek", { detail: sec }));

  return (
    <div ref={listRef} className="space-y-0.5 overflow-y-auto pr-2">
      {segments.map((seg, i) => (
        <p
          key={i}
          data-idx={i}
          className={`cursor-pointer rounded-r-lg px-2 py-1 text-base leading-7 ${
            i === activeIdx
              ? "border-l-[3px] border-brand bg-highlight"
              : "border-l-[3px] border-transparent hover:bg-line/40"
          }`}
          onClick={() => seek(seg.start)}
        >
          <span className="mr-2 font-mono text-xs text-weak hover:text-brand">
            {formatTime(seg.start)}
          </span>
          {seg.text}
        </p>
      ))}
    </div>
  );
}
