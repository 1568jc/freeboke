"use client";

import { useEffect, useRef, useState } from "react";

const SPEEDS = [1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`; // 统一 h:mm:ss
}

/**
 * 吸顶迷你播放条（移动端吸底）：播放/暂停、±15s、倍速、可拖进度条、时间显示。
 * 是全页唯一的 <audio> 持有者；对外通信：
 *   监听 "episode:seek"（detail: 秒）→ 跳转播放
 *   广播 "episode:timeupdate"（detail: 秒）→ 文稿高亮/章节高亮
 */
export function PlayerBar({
  episodeId,
  durationSec,
}: {
  episodeId: number;
  /** 数据库里 ffprobe 存的时长，作元数据的兜底（防 loadedmetadata 竞态） */
  durationSec: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [speedIdx, setSpeedIdx] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      window.dispatchEvent(new CustomEvent("episode:timeupdate", { detail: audio.currentTime }));
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    // 竞态兜底：effect 挂载时元数据可能已就绪
    if (audio.readyState >= 1) syncDuration();
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
    };
  }, []);

  // 外部跳转请求（文稿时间戳 / 章节 / 对话引用）
  useEffect(() => {
    const handler = (e: Event) => {
      const sec = (e as CustomEvent<number>).detail;
      const audio = audioRef.current;
      if (!audio || typeof sec !== "number") return;
      audio.currentTime = sec;
      void audio.play().catch(() => undefined);
    };
    window.addEventListener("episode:seek", handler);
    return () => window.removeEventListener("episode:seek", handler);
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + delta, 0), audio.duration || 0);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const btn = "rounded-lg px-2 py-1 text-xs text-sub hover:bg-line/40";

  return (
    <div className="z-20 h-14 border-b border-line bg-paper max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:border-b-0 max-md:border-t md:sticky md:top-0">
      <audio ref={audioRef} preload="metadata" src={`/api/episodes/${episodeId}/audio`} />
      {/* 内部元素水平居中成组，左右不贴边 */}
      <div className="mx-auto flex h-full max-w-[720px] items-center justify-center gap-3 px-10">
        <button onClick={() => skip(-15)} className={btn} title="后退 15 秒">
          -15s
        </button>
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm text-white hover:opacity-90"
          title={playing ? "暂停" : "播放"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => skip(15)} className={btn} title="前进 15 秒">
          +15s
        </button>
        <button onClick={cycleSpeed} className={btn} title="倍速">
          {SPEEDS[speedIdx]}x
        </button>
        <span className="font-mono text-xs text-weak tabular-nums">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (audioRef.current) audioRef.current.currentTime = t;
            setCurrentTime(t);
          }}
          className="h-1 flex-1 cursor-pointer accent-brand"
        />
      </div>
    </div>
  );
}
