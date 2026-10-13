import { prisma } from "@/lib/prisma";
import { hasActiveTask, startDownload } from "@/lib/tasks";

export const runtime = "nodejs";

/** 创建"链接下载"任务（支持纯链接或含链接的分享文本） */
export async function POST(request: Request) {
  let raw: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    raw = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  // 先按纯链接解析；失败则从分享文本中提取首个 URL（如 B 站【标题】 链接?share_source=…）
  let url = raw;
  try {
    new URL(url);
  } catch {
    const m = raw.match(/https?:\/\/[^\s，。"'【】<>()\[\]]+/);
    if (m) {
      try {
        url = new URL(m[0]).toString();
      } catch {
        return Response.json({ error: "链接格式不对，请粘贴完整 URL 或分享文本" }, { status: 400 });
      }
    } else {
      return Response.json({ error: "链接格式不对，请粘贴完整 URL 或分享文本" }, { status: 400 });
    }
  }

  if (await hasActiveTask()) {
    return Response.json({ error: "已有任务在处理中，一次只处理一期" }, { status: 409 });
  }

  const episode = await prisma.episode.create({
    data: { sourceType: "link", sourceUrl: url, status: "downloading" },
  });

  startDownload(episode.id, url);

  return Response.json({ id: episode.id }, { status: 201 });
}
