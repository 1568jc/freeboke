"use client";

import { useEffect, useState } from "react";
import { FileText, Lightbulb, ListMusic, Quote } from "lucide-react";
import type { Chapter, Point, Quote as QuoteItem } from "@/lib/chapters";

function fmt(sec: number): string {
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function seek(sec: number) {
  window.dispatchEvent(new CustomEvent("episode:seek", { detail: sec }));
}

const card =
  "rounded-xl border border-line bg-paper p-4 shadow-[0_1px_4px_rgba(31,35,41,0.04)]";
const heading = "mb-2 flex items-center gap-1.5 text-xs font-semibold text-sub";
const icon = "h-3.5 w-3.5 text-brand";

/** 右侧导读栏：概要 + 章节速览（标题+摘要，跟随播放高亮）+ 核心要点 + 金句 */
export function GuidePanel({
  summary,
  chapters,
  points,
  quotes,
}: {
  summary: string | null;
  chapters: Chapter[];
  points: Point[];
  quotes: QuoteItem[];
}) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const onTime = (e: Event) => setCurrentTime((e as CustomEvent<number>).detail);
    window.addEventListener("episode:timeupdate", onTime);
    return () => window.removeEventListener("episode:timeupdate", onTime);
  }, []);

  if (!summary && chapters.length === 0 && points.length === 0 && quotes.length === 0) {
    return null;
  }

  const activeIdx = chapters.reduce((acc, c, i) => (c.start <= currentTime ? i : acc), -1);

  return (
    <aside className="w-full shrink-0 space-y-4">
      {summary && (
        <section className={card}>
          <h3 className={heading}>
            <FileText className={icon} aria-hidden="true" />
            概要
          </h3>
          <p className="text-xs leading-6 text-ink">{summary}</p>
        </section>
      )}

      {chapters.length > 0 && (
        <section className={card}>
          <h3 className={heading}>
            <ListMusic className={icon} aria-hidden="true" />
            章节速览
          </h3>
          <nav className="space-y-1">
            {chapters.map((c, i) => (
              <button
                key={i}
                onClick={() => seek(c.start)}
                className={`block w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                  i === activeIdx ? "bg-highlight" : "hover:bg-line/40"
                }`}
              >
                <span
                  className={`block truncate text-xs leading-5 ${
                    i === activeIdx ? "text-brand font-medium" : "text-ink"
                  }`}
                >
                  <span className="mr-1.5 font-mono text-brand">{fmt(c.start)}</span>
                  {c.title}
                </span>
                {c.desc && (
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-weak">
                    {c.desc}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </section>
      )}

      {points.length > 0 && (
        <section className={card}>
          <h3 className={heading}>
            <Lightbulb className={icon} aria-hidden="true" />
            核心要点
          </h3>
          <ol className="space-y-2">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2 text-xs leading-5 text-ink">
                <span className="shrink-0 font-mono text-brand">{i + 1}.</span>
                <span>
                  {p.time !== null && (
                    <button
                      onClick={() => seek(p.time!)}
                      className="mr-1 font-mono text-brand hover:underline"
                      title="跳转到此处"
                    >
                      {fmt(p.time)}
                    </button>
                  )}
                  {p.text}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {quotes.length > 0 && (
        <section className={card}>
          <h3 className={heading}>
            <Quote className={icon} aria-hidden="true" />
            金句
          </h3>
          <ul className="space-y-2.5">
            {quotes.map((q, i) => (
              <li
                key={i}
                className="border-l-2 border-line pl-2.5 text-xs leading-5 text-ink"
              >
                {q.time !== null ? (
                  <button
                    onClick={() => seek(q.time!)}
                    className="mr-1.5 font-mono text-brand hover:underline"
                    title="跳转到此处"
                  >
                    {fmt(q.time)}
                  </button>
                ) : null}
                {q.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
