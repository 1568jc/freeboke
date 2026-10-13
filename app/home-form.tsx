"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CloudUpload, Link2, Search } from "lucide-react";

type Mode = "link" | "upload";

export function HomeForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"idle" | "link" | "upload">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function postAndGoto(input: string | File, kind: "link" | "upload") {
    setBusy(kind);
    setError(null);
    try {
      const res =
        kind === "link"
          ? await fetch("/api/episodes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: input }),
            })
          : await (() => {
              const fd = new FormData();
              fd.append("file", input);
              return fetch("/api/upload", { method: "POST", body: fd });
            })();

      const data = (await res.json()) as { id?: number; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? `请求失败（HTTP ${res.status}）`);
        return;
      }
      router.push(`/episode/${data.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="space-y-4">
      {/* 模式切换 pill */}
      <div className="mx-auto flex w-fit rounded-full border border-line bg-paper p-1 shadow-[0_1px_4px_rgba(31,35,41,0.04)]">
        {(
          [
            ["link", "在线链接"],
            ["upload", "本地上传"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`rounded-full px-5 py-1.5 text-sm transition-colors ${
              mode === key ? "bg-brand text-white" : "text-sub hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "link" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && busy === "idle") void postAndGoto(url.trim(), "link");
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-line bg-paper p-2 pl-4 shadow-[0_1px_4px_rgba(31,35,41,0.04)] focus-within:border-brand">
            <Link2 className="h-4 w-4 shrink-0 text-weak" aria-hidden="true" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴播客 / 音频链接，支持 B 站、小宇宙、YouTube、直链…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="播客或音频链接"
            />
            <button
              type="submit"
              disabled={busy !== "idle" || !url.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {busy === "link" ? "创建中…" : "开始处理"}
            </button>
          </div>
        </form>
      ) : (
        <div
          className={`rounded-2xl border border-dashed border-line bg-paper p-10 text-center shadow-[0_1px_4px_rgba(31,35,41,0.04)] transition-colors ${
            busy === "idle" ? "cursor-pointer hover:border-brand hover:bg-highlight" : "opacity-50"
          }`}
          onClick={() => busy === "idle" && fileInputRef.current?.click()}
        >
          <CloudUpload className="mx-auto h-8 w-8 text-brand" aria-hidden="true" />
          <span className="mt-3 block text-sm font-medium">
            {busy === "upload" ? "上传中…" : "点击选择音频，或把文件拖到这里"}
          </span>
          <span className="mt-1 block text-xs text-sub">
            mp3 / m4a / wav，单个 ≤500MB、时长 ≤6 小时
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,audio/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void postAndGoto(f, "upload");
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-highlight px-3 py-2 text-sm text-brand">{error}</p>
      )}
    </div>
  );
}
