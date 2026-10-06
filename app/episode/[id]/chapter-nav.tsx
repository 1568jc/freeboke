"use client";

import { useEffect, useState } from "react";
import type { Chapter } from "@/lib/chapters";

function fmt(sec: number): string {
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 左侧章节速览栏（可收起；移动端默认收起） */
export function ChapterNav({ chapters }: { chapters: Chapter[] }) {
  const [collapsed, setCollapsed] = useState(true); // 默认收起，桌面端挂载后展开
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    // 桌面端默认展开，移动端保持收起（rAF 避免同步 setState 触发级联渲染）
    const raf = requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 768px)").matches) setCollapsed(false);
    });
    const onTime = (e: Event) => setCurrentTime((e as CustomEvent<number>).detail);
    window.addEventListener("episode:timeupdate", onTime);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("episode:timeupdate", onTime);
    };
  }, []);

  if (chapters.length === 0) return null;

  const activeIdx = chapters.reduce((acc, c, i) => (c.start <= currentTime ? i : acc), -1);
  const seek = (sec: number) =>
    window.dispatchEvent(new CustomEvent("episode:seek", { detail: sec }));

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed left-0 top-1/2 z-10 rounded-r-lg border border-l-0 border-line bg-paper px-1.5 py-3 text-xs text-weak hover:text-ink"
        title="展开章节"
      >
        章 ▶
      </button>
    );
  }

  return (
    <aside className="sticky top-20 max-h-[calc(100vh-96px)] w-60 shrink-0 self-start overflow-hidden rounded-lg bg-paper max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:rounded-none max-md:border-r max-md:border-line max-md:shadow-lg">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-sub">章节速览</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-xs text-weak hover:text-sub"
          title="收起"
        >
          ◀ 收起
        </button>
      </div>
      <nav className="max-h-[70vh] overflow-y-auto p-2">
        {chapters.map((c, i) => (
          <button
            key={i}
            onClick={() => seek(c.start)}
            title={c.title}
            className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs leading-5 ${
              i === activeIdx
                ? "text-brand font-medium"
                : "text-sub hover:bg-line/40"
            }`}
          >
            <span className="mr-1.5 font-mono text-brand">{fmt(c.start)}</span>
            {c.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}
