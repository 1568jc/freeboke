"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles } from "lucide-react";

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

/** 错误信息清洗：AI SDK 会把非 2xx 响应的整个 HTML body 塞进 message，需去标签截断 */
function friendlyError(message: string): string {
  if (/<\/?[a-z][\s\S]*>/i.test(message) || /This page could not be found/i.test(message)) {
    return "请求接口失败（可能是服务刚重启），请重新发送";
  }
  const plain = message.replace(/\s+/g, " ").trim();
  return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
}

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
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={streaming}
            className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-sub transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
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
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-highlight">
              <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
            </span>
            <p className="text-xs text-weak">对这期节目有任何疑问，直接问 ↑</p>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm leading-6 text-white">
                  {text}
                </p>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-highlight">
                <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-paper px-4 py-3">
                <div className="prose max-w-none">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) =>
                        href?.startsWith("seek://") ? (
                          <button
                            className="mx-0.5 rounded bg-highlight px-1.5 py-0.5 font-mono text-xs leading-4 text-brand transition-colors hover:bg-brand hover:text-white"
                            onClick={() => seek(Number(href.slice(7)))}
                          >
                            {children}
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
            </div>
          );
        })}
        {streaming && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-highlight">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-brand" aria-hidden="true" />
            </span>
            <p className="py-1 text-xs text-weak">正在思考…</p>
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-highlight px-3 py-2 text-xs text-brand">
            出错了：{friendlyError(error.message)}（可重发上一条重试）
          </p>
        )}
      </div>

      {/* 输入框 */}
      <form
        className="mt-3 flex items-center gap-2 rounded-full border border-line bg-paper p-1.5 pl-4 transition-colors focus-within:border-brand"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问问这期节目…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="发送"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
