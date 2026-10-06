"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";

/** [mm:ss] / [h:mm:ss] → 秒 */
function tsToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

/** 把回答中的时间戳转成 seek:// 链接，交给自定义 <a> 渲染成跳转按钮 */
function linkifyTimestamps(text: string): string {
  return text.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_m, ts: string) => `[${ts}](seek://${tsToSeconds(ts)})`);
}

const PRESET_QUESTIONS = [
  "这期节目讲了什么",
  "嘉宾的核心观点是什么",
  "有哪些值得记住的金句",
  "帮我反驳一下这期的观点",
];

export function ChatPanel({
  episodeId,
  hasTranscript,
  initialMessages,
}: {
  episodeId: number;
  hasTranscript: boolean;
  initialMessages: Array<{ id: number; role: string; content: string }>;
}) {
  const [input, setInput] = useState("");
  const initial: UIMessage[] = useMemo(
    () =>
      initialMessages.map((m) => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: m.content }],
      })),
    [initialMessages],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({ api: `/api/episodes/${episodeId}/chat` }),
    messages: initial,
  });
  const streaming = status === "streaming" || status === "submitted";

  const send = (text: string) => {
    if (!text.trim() || streaming) return;
    sendMessage({ text: text.trim() });
    setInput("");
  };

  const clearAll = async () => {
    if (!window.confirm("清空这期节目的全部对话记录？")) return;
    const res = await fetch(`/api/episodes/${episodeId}/chat`, { method: "DELETE" });
    if (res.ok) setMessages([]);
  };

  const seek = (sec: number) => {
    window.dispatchEvent(new CustomEvent("episode:seek", { detail: sec }));
  };

  if (!hasTranscript) {
    return <p className="text-sm text-sub">转写完成后可针对内容提问</p>;
  }

  return (
    <div className="flex h-[70vh] flex-col">
      {/* 预设问题 + 清空 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={streaming}
            className="rounded-full bg-highlight px-2.5 py-1 text-xs text-brand hover:opacity-80 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
        {messages.length > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto text-xs text-weak hover:text-brand"
          >
            清空
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-weak">
            对这期节目有任何疑问，直接问 ↓
          </p>
        )}
        {messages.map((m) => {
          const text = m.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-lg bg-brand px-3 py-2 text-sm text-white">
                  {text}
                </p>
              </div>
            );
          }
          return (
            <div key={m.id} className="rounded-lg bg-line/40 px-3 py-2">
              <div className="prose max-w-none">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) =>
                      href?.startsWith("seek://") ? (
                        <button
                          className="mx-0.5 rounded bg-highlight px-1 font-mono text-xs text-brand hover:underline"
                          onClick={() => seek(Number(href.slice(7)))}
                        >
                          ▶ {children}
                        </button>
                      ) : (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                  }}
                >
                  {linkifyTimestamps(text)}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
        {streaming && <p className="text-xs text-weak">正在思考…</p>}
        {error && (
          <p className="rounded bg-highlight px-2 py-1 text-xs text-brand">
            出错了：{error.message}（可重发上一条重试）
          </p>
        )}
      </div>

      {/* 输入框 */}
      <form
        className="mt-2 flex gap-2 border-t pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问问这期节目…"
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  );
}
