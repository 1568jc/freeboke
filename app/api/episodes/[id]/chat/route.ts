import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import { prisma } from "@/lib/prisma";
import { llmModel } from "@/lib/llm";
import { formatTime } from "@/lib/export";
import type { Segment } from "@/lib/asr";

export const runtime = "nodejs";
export const maxDuration = 300;

function buildSystemPrompt(episodeTitle: string, segments: Segment[]): string {
  const text = segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join("\n");
  return `你是播客节目「${episodeTitle}」的内容助手。以下是这期节目的完整转写文稿（每行以 [mm:ss] 时间戳开头）：

<transcript>
${text}
</transcript>

回答规则：
1. 所有回答严格基于上述文稿，文稿未提及的内容明确说"文稿里没有提到"，不得编造。
2. 涉及具体观点、事实、语句时，标注对应时间戳，格式 [mm:ss]（超过 1 小时用 [h:mm:ss]）。
3. 回答用简体中文，口语化但准确，篇幅适中。`;
}

/** 单集内容对话（流式） */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      transcript: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!episode) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (!episode.transcript) {
    return Response.json({ error: "还没有文字稿，请先完成转写" }, { status: 400 });
  }

  let uiMessages: UIMessage[];
  try {
    uiMessages = ((await request.json()) as { messages?: UIMessage[] }).messages ?? [];
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  // 持久化：用户刚发出的最后一条 user 消息
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const text = lastUser.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) {
      await prisma.chatMessage.create({
        data: { episodeId, role: "user", content: text },
      });
    }
  }

  let segments: Segment[] = [];
  try {
    segments = JSON.parse(episode.transcript.segments);
  } catch {
    segments = [];
  }

  // 历史消息（DB）在前，本轮 UI 消息在后
  const history: ModelMessage[] = episode.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const converted = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: deepseek(llmModel()),
    instructions: buildSystemPrompt(episode.title ?? "未命名节目", segments),
    messages: [...history, ...converted],
    onFinish: async ({ text }) => {
      if (text) {
        await prisma.chatMessage.create({
          data: { episodeId, role: "assistant", content: text },
        });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

/** 清空该集的对话记录 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId)) {
    return Response.json({ error: "id 不合法" }, { status: 400 });
  }
  const { count } = await prisma.chatMessage.deleteMany({ where: { episodeId } });
  return Response.json({ ok: true, deleted: count });
}
