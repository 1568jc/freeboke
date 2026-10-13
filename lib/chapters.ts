export type Chapter = { start: number; end: number; title: string; desc: string | null };
export type Quote = { text: string; time: number | null };
export type Point = { text: string; time: number | null };

/** mm:ss / h:mm:ss → 秒 */
function toSec(ts: string): number {
  const p = ts.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

/** 截取某标题板块的正文（到下一个标题为止；`### [时间] 章节式子标题不截断；板块不存在返回 null） */
function sectionBody(md: string, name: string): string | null {
  const lines = md.split("\n");
  const startRe = new RegExp(`^#{1,3}\\s*${name}`);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  const headingRe = /^#{1,3}\s/;
  const chapterSubRe = /^#{3,6}\s*\[/; // 章节式子标题（### [mm:ss-…]）属本板块
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (headingRe.test(lines[i]) && !chapterSubRe.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

/** 从文章 Markdown 的"章节大纲"板块解析章节（标题 + 首个要点作摘要）。
 *  兼容多种 LLM 输出格式：
 *  - `- **[mm:ss-mm:ss] 标题**`（prompt 指定格式）
 *  - `### [mm:ss-mm:ss] 标题`（标题式，下方跟 `- ` 要点行）
 *  - `- [mm:ss-mm:ss] **标题**：要点`（列表式） */
export function parseChapters(articleMd: string): Chapter[] {
  const section = sectionBody(articleMd, "章节大纲") ?? "";

  const chapters: Chapter[] = [];
  const rangeRe = /\[(\d{1,2}:\d{2}(?::\d{2})?)-(\d{1,2}:\d{2}(?::\d{2})?)\]/;
  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = rangeRe.exec(line);
    if (m) {
      // 时间戳之后的残余文本：去标题/列表/粗体标记
      let title = line
        .slice(m.index + m[0].length)
        .replace(/^#+\s*/, "")
        .trim();
      // 若含粗体段，取第一个粗体段作标题
      const bold = /\*\*([^*]+)\*\*/.exec(title);
      if (bold) title = bold[1];
      title = title.replace(/\*\*/g, "").trim();
      if (!title) continue;
      chapters.push({ start: toSec(m[1]), end: toSec(m[2]), title, desc: null });
      continue;
    }
    // 章节标题下的首个要点/正文行 → 作为该章节摘要（跳过其他标题行）
    if (chapters.length > 0 && chapters[chapters.length - 1].desc === null && !line.startsWith("#")) {
      const bullet = line.replace(/^[-*+]\s*/, "").replace(/\*\*/g, "").trim();
      if (bullet) {
        chapters[chapters.length - 1].desc = bullet;
      }
    }
  }
  return chapters;
}

/** 提取"一句话摘要"板块正文 */
export function parseSummary(articleMd: string): string | null {
  return sectionBody(articleMd, "一句话摘要");
}

/** 行内首个时间戳（兼容单点 [mm:ss] 与区间 [mm:ss-mm:ss]，取起点） */
const TIME_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)(?:-\d{1,2}:\d{2}(?::\d{2})?)?\]/;

/** 提取"核心要点"板块：有序列表，每条可带 [mm:ss] 时间戳（取第一个） */
export function parsePoints(articleMd: string): Point[] {
  const body = sectionBody(articleMd, "核心要点");
  if (!body) return [];
  const points: Point[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const tm = line.match(TIME_RE);
    const text = line
      .replace(/^[-*+]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/\s*依据[:：][^\n]*$/, "") // 去掉尾部"依据：[…]"引用
      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?\]/g, "")
      .replace(/\*\*/g, "")
      .trim();
    if (text) points.push({ text, time: tm ? toSec(tm[1]) : null });
  }
  return points;
}

/** 提取"金句摘录"板块：每行一条，可带 [mm:ss] 时间戳 */
export function parseQuotes(articleMd: string): Quote[] {
  const body = sectionBody(articleMd, "金句摘录");
  if (!body) return [];
  const quotes: Quote[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const tm = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
    const text = line
      .replace(/^[-*+>]\s*/, "") // 列表/引用标记
      .replace(/^\d+\.\s*/, "") // 有序列表序号
      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, "") // 时间戳
      .replace(/\*\*/g, "") // 粗体
      .trim();
    if (text) quotes.push({ text, time: tm ? toSec(tm[1]) : null });
  }
  return quotes;
}
