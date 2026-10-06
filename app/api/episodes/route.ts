import { prisma } from "@/lib/prisma";
import { hasActiveTask, startDownload } from "@/lib/tasks";

export const runtime = "nodejs";

/** 创建"链接下载"任务 */
export async function POST(request: Request) {
  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return Response.json({ error: "链接格式不对，请粘贴完整 URL" }, { status: 400 });
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
