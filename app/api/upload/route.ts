import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@/lib/prisma";
import { startTranscription } from "@/lib/asr";
import { AUDIO_DIR, hasActiveTask, MAX_DURATION_SEC, probeDuration, transcodeTo16kMono } from "@/lib/tasks";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_EXT = [".mp3", ".m4a", ".wav"];

/** 上传本地音频文件 */
export async function POST(request: Request) {
  let file: File;
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (!(candidate instanceof File)) throw new Error("missing file");
    file = candidate;
  } catch {
    return Response.json({ error: "未收到文件，请选择音频文件上传" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return Response.json({ error: "仅支持 mp3 / m4a / wav 格式" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "文件超过 500MB 上限" }, { status: 400 });
  }

  if (await hasActiveTask()) {
    return Response.json({ error: "已有任务在处理中，一次只处理一期" }, { status: 409 });
  }

  const episode = await prisma.episode.create({
    data: { sourceType: "upload", title: file.name, status: "downloading" },
  });

  // 流式写盘，避免整文件进内存
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const filePath = path.join(AUDIO_DIR, `${episode.id}${ext}`);
  try {
    await pipeline(
      Readable.fromWeb(file.stream() as unknown as import("node:stream/web").ReadableStream),
      createWriteStream(filePath),
    );
  } catch (err) {
    await fs.rm(filePath, { force: true });
    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: "failed", errorMsg: `文件写入失败：${err instanceof Error ? err.message : err}` },
    });
    return Response.json({ error: "文件写入失败" }, { status: 500 });
  }

  const durationSec = await probeDuration(filePath);
  if (durationSec !== undefined && durationSec > MAX_DURATION_SEC) {
    await fs.rm(filePath, { force: true });
    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: "failed", errorMsg: `音频时长 ${Math.round(durationSec / 60)} 分钟，超过 6 小时上限` },
    });
    return Response.json({ error: "音频时长超过 6 小时上限" }, { status: 400 });
  }

  // 与下载链路一致：统一转 16kHz 单声道 mp3（ASR 友好、体积最小，wav 大文件尤其需要）
  let finalPath = filePath;
  try {
    finalPath = await transcodeTo16kMono(filePath);
  } catch (err) {
    await fs.rm(filePath, { force: true });
    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: "failed", errorMsg: `音频转码失败：${err instanceof Error ? err.message : err}` },
    });
    return Response.json({ error: "音频转码失败" }, { status: 500 });
  }

  await prisma.episode.update({
    where: { id: episode.id },
    data: { audioPath: finalPath, durationSec: durationSec ?? null, status: "transcribing", downloadedAt: new Date() },
  });
  startTranscription(episode.id);

  return Response.json({ id: episode.id }, { status: 201 });
}
