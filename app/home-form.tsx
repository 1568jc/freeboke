"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CloudUpload, Link2, Search } from "lucide-react";

type Mode = "link" | "upload";

/** 从粘贴内容中提取首个 URL：支持纯链接和「【标题】 链接?share_source=…」分享文本 */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s，。"'【】<>()\[\]]+/);
  return m ? m[0] : null;
}

/** XHR 上传（fetch 拿不到上传进度）：onProgress 回报 0-100 */
function uploadWithProgress(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ status: number; data: { id?: number; error?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { id?: number; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        // 非 JSON 响应（如 nginx 错误页），按状态码处理
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("network"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function HomeForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"idle" | "link" | "upload">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function postAndGoto(input: string | File, kind: "link" | "upload") {
    setBusy(kind);
    setError(null);
    try {
      let data: { id?: number; error?: string };
      let status: number;
      if (kind === "link") {
        const res = await fetch("/api/episodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input }),
        });
        status = res.status;
        data = (await res.json()) as typeof data;
      } else {
        setUploadPct(0);
        const r = await uploadWithProgress(input as File, setUploadPct);
        status = r.status;
        data = r.data;
      }

      if (status < 200 || status >= 300 || !data.id) {
        setError(data.error ?? `请求失败（HTTP ${status}）`);
        return;
      }
      router.push(`/episode/${data.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBusy("idle");
      setUploadPct(0);
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
            if (busy !== "idle") return;
            const extracted = extractUrl(url);
            if (!extracted) {
              setError("没有找到有效链接，请粘贴链接或分享文本");
              return;
            }
            void postAndGoto(extracted, "link");
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-line bg-paper p-2 pl-4 shadow-[0_1px_4px_rgba(31,35,41,0.04)] focus-within:border-brand">
            <Link2 className="h-4 w-4 shrink-0 text-weak" aria-hidden="true" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴链接或分享文本（如 B 站【标题】+ 链接），支持 B 站、小宇宙、YouTube、直链…"
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
            busy === "idle" ? "cursor-pointer hover:border-brand hover:bg-highlight" : "opacity-70"
          }`}
          onClick={() => busy === "idle" && fileInputRef.current?.click()}
        >
          <CloudUpload className="mx-auto h-8 w-8 text-brand" aria-hidden="true" />
          {busy === "upload" ? (
            <div className="mx-auto mt-4 max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <span className="mt-2 block text-xs text-sub">
                {uploadPct < 100 ? `上传中 ${uploadPct}%` : "上传完成，服务器处理中…"}
              </span>
            </div>
          ) : (
            <>
              <span className="mt-3 block text-sm font-medium">
                点击选择音频，或把文件拖到这里
              </span>
              <span className="mt-1 block text-xs text-sub">
                mp3 / m4a / wav，单个 ≤500MB、时长 ≤6 小时
              </span>
            </>
          )}
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
