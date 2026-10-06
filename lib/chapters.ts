export type Chapter = { start: number; end: number; title: string };

/** 从文章 Markdown 的"章节大纲"板块解析章节时间点（格式：- **[mm:ss-mm:ss] 标题**） */
export function parseChapters(articleMd: string): Chapter[] {
  const start = articleMd.indexOf("章节大纲");
  if (start < 0) return [];
  const rest = articleMd.slice(start);
  const nextH2 = rest.slice(10).search(/^##\s/m);
  const section = nextH2 > 0 ? rest.slice(0, nextH2 + 10) : rest;

  const chapters: Chapter[] = [];
  const re = /\*\*\[(\d{1,2}:\d{2}(?::\d{2})?)-(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  const toSec = (ts: string) => {
    const p = ts.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };
  while ((m = re.exec(section)) !== null) {
    chapters.push({ start: toSec(m[1]), end: toSec(m[2]), title: m[3].trim() });
  }
  return chapters;
}
