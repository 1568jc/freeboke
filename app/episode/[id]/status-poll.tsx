"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  downloading: "下载中",
  transcribing: "转写中",
  summarizing: "梳理中",
  done: "完成",
  failed: "失败",
};

const ACTIVE = new Set(["pending", "downloading", "transcribing", "summarizing"]);

type StageTimes = {
  createdAt: string | null;
  downloadedAt: string | null;
  transcribedAt: string | null;
  summarizedAt: string | null;
};

function fmtElapsed(ms: number): string {
  const s = Math.max(Math.round(ms / 1000), 0);
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`;
}

/** 各环节耗时文本（下载 / 转写 / 梳理） */
function stageSummary(t: StageTimes): string {
  const parts: string[] = [];
  const c = t.createdAt ? +new Date(t.createdAt) : null;
  const d = t.downloadedAt ? +new Date(t.downloadedAt) : null;
  const tr = t.transcribedAt ? +new Date(t.transcribedAt) : null;
  const su = t.summarizedAt ? +new Date(t.summarizedAt) : null;
  if (c && d) parts.push(`下载 ${fmtElapsed(d - c)}`);
  if (d && tr) parts.push(`转写 ${fmtElapsed(tr - d)}`);
  if (tr && su) parts.push(`梳理 ${fmtElapsed(su - tr)}`);
  return parts.join(" · ");
}

/** 任务状态轮询：进行中每 2s 查一次并显示已用时，状态变化时刷新服务端组件 */
export function StatusPoll({
  episodeId,
  initialStatus,
  initialErrorMsg,
  initialTimes,
}: {
  episodeId: number;
  initialStatus: string;
  initialErrorMsg: string | null;
  initialTimes: StageTimes;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [errorMsg, setErrorMsg] = useState(initialErrorMsg);
  const [times, setTimes] = useState<StageTimes>(initialTimes);
  const [now, setNow] = useState<number>(() => Date.now());
  const [alive, setAlive] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!ACTIVE.has(status)) return;
    const tick = setInterval(() => setNow(Date.now()), 2000);
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/episodes/${episodeId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: string;
          errorMsg: string | null;
          alive: boolean;
        } & StageTimes;
        if (data.alive !== alive) setAlive(data.alive);
        if (data.status !== status) {
          setStatus(data.status);
          setErrorMsg(data.errorMsg);
          setTimes(data);
          router.refresh(); // 让服务端组件拿到最新数据（标题、文稿、文章等）
        }
      } catch {
        // 轮询失败静默，下一轮再试
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [episodeId, status, alive, router]);

  // 中断恢复：状态停在中途但进程内没有任务在跑（服务重启残留）
  const retry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/retry`, { method: "POST" });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) {
        alert(data.error ?? "重试失败");
        return;
      }
      if (data.status) setStatus(data.status);
      setAlive(true);
      router.refresh();
    } finally {
      setRetrying(false);
    }
  };

  // 当前环节的起点（用于"已用时"）
  const stageStart = (() => {
    if (status === "downloading" || status === "pending") return times.createdAt;
    if (status === "transcribing") return times.downloadedAt ?? times.createdAt;
    if (status === "summarizing") return times.transcribedAt ?? times.downloadedAt;
    return null;
  })();
  const elapsed = stageStart ? fmtElapsed(now - +new Date(stageStart)) : null;

  // 中断判定：进行中但进程内无任务（服务重启残留）
  const interrupted = ACTIVE.has(status) && !alive;

  return (
    <p className="text-xs text-sub">
      状态：{STATUS_LABEL[status] ?? status}
      {interrupted ? (
        <>
          {"（已中断，通常是服务重启导致）"}
          <button
            onClick={retry}
            disabled={retrying}
            className="ml-2 rounded-md border border-line px-2 py-0.5 text-xs text-brand hover:bg-highlight disabled:opacity-40"
          >
            {retrying ? "重启中…" : "继续处理"}
          </button>
        </>
      ) : (
        ACTIVE.has(status) && elapsed ? `（已用时 ${elapsed}）` : ""
      )}
      {status === "done" && stageSummary(times) ? ` · ${stageSummary(times)}` : ""}
      {errorMsg ? ` · ${errorMsg}` : ""}
    </p>
  );
}
