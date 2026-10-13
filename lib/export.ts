import type { Segment } from "./asr";

// ---------- 时间格式化 ----------

export function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** SRT 时间轴格式：HH:MM:SS,mmm */
function srtTime(sec: number): string {
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// ---------- 文稿格式 ----------

export function transcriptToSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}`)
    .join("\n\n");
}

export type TranscriptRenderOpts = { timestamps?: boolean };

export function transcriptToTxt(
  segments: Segment[],
  { timestamps = true }: TranscriptRenderOpts = {},
): string {
  if (!timestamps) return segments.map((s) => s.text).join("\n");
  return segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join("\n");
}

export function transcriptToMd(
  segments: Segment[],
  { timestamps = true }: TranscriptRenderOpts = {},
): string {
  if (!timestamps) return segments.map((s) => s.text).join("\n\n");
  return segments.map((s) => `**[${formatTime(s.start)}]** ${s.text}`).join("\n\n");
}

export function transcriptToJson(segments: Segment[]): string {
  return JSON.stringify(segments, null, 2);
}

// ---------- 文章格式 ----------

/** 去 Markdown 标记的纯文本（行级处理，够导出用） */
export function articleToTxt(md: string): string {
  return md
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "") // 标题
        .replace(/^[-*+]\s+/, "· ") // 列表
        .replace(/^\d+\.\s+/, (m) => m) // 有序列表保留序号
        .replace(/^>\s?/, "") // 引用
        .replace(/\*\*([^*]+)\*\*/g, "$1") // 粗体
        .replace(/\*([^*]+)\*/g, "$1") // 斜体
        .replace(/`([^`]+)`/g, "$1") // 行内代码
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"), // 链接留文字
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 独立 HTML 文件（内联排版样式，可直接双击打开） */
export function articleToHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.8; color: #222; }
  h1 { font-size: 1.6em; border-bottom: 1px solid #ddd; padding-bottom: .3em; }
  h2 { font-size: 1.3em; margin-top: 1.5em; }
  h3 { font-size: 1.1em; }
  blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 1em; color: #555; }
  code { background: #f5f5f5; padding: 0 .3em; border-radius: 3px; }
  a { color: #2563eb; }
  .meta { color: #888; font-size: .85em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- DOCX ----------

/** 文章 Markdown → DOCX buffer（行级映射：标题/列表/引用/段落） */
export async function articleToDocx(title: string, md: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  type Heading = keyof typeof HeadingLevel;
  const paragraphs = md.split("\n").map((raw) => {
    const line = raw.trimEnd();
    const text = line
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      const level = `HEADING_${heading[1].length}` as Heading;
      return new Paragraph({ heading: HeadingLevel[level], children: [new TextRun(heading[2])] });
    }
    if (/^[-*+]\s+/.test(line)) {
      return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text.replace(/^[-*+]\s+/, ""))] });
    }
    const ordered = line.match(/^(\d+)\.\s+(.*)/);
    if (ordered) {
      return new Paragraph({ children: [new TextRun(`${ordered[1]}. ${ordered[2]}`)] });
    }
    if (/^>\s?/.test(line)) {
      return new Paragraph({ children: [new TextRun({ text: text.replace(/^>\s?/, ""), italics: true })], indent: { left: 400 } });
    }
    return new Paragraph({ children: [new TextRun(text)] });
  });

  const doc = new Document({
    title,
    sections: [{ children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}

/** 文稿 → DOCX（可选时间戳加粗 + 文本段落） */
export async function transcriptToDocx(
  title: string,
  segments: Segment[],
  { timestamps = true }: TranscriptRenderOpts = {},
): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const paragraphs = segments.map(
    (s) =>
      new Paragraph({
        children: [
          ...(timestamps
            ? [new TextRun({ text: `[${formatTime(s.start)}] `, bold: true, color: "888888" })]
            : []),
          new TextRun(s.text),
        ],
      }),
  );
  const doc = new Document({ title, sections: [{ children: paragraphs }] });
  return Packer.toBuffer(doc);
}
