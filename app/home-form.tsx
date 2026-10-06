"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function HomeForm() {
  const router = useRouter();
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
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && busy === "idle") void postAndGoto(url.trim(), "link");
        }}
      >
        <label htmlFor="source-url" className="block text-sm font-medium">
          播客 / 音频链接
        </label>
        <div className="flex gap-2">
          <input
            id="source-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="支持音频直链、B 站、YouTube、小宇宙单集…"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy !== "idle" || !url.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "link" ? "创建中…" : "开始处理"}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-weak">
        <span className="h-px flex-1 bg-line" />
        或
        <span className="h-px flex-1 bg-line" />
      </div>

      <div
        className={`rounded-lg border border-dashed border-line p-8 text-center ${
          busy === "idle" ? "cursor-pointer hover:border-weak" : "opacity-50"
        }`}
        onClick={() => busy === "idle" && fileInputRef.current?.click()}
      >
        <span className="block text-sm font-medium">
          {busy === "upload" ? "上传中…" : "上传本地音频"}
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

      {error && (
        <p className="rounded-lg bg-highlight px-3 py-2 text-sm text-brand">{error}</p>
      )}
    </div>
  );
}
