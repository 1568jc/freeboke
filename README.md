# 播客转文字稿

把播客变成 10 分钟读完的文章：粘贴链接或上传音频，自动下载、转写为带时间戳的文稿，再由 AI 梳理成结构化文章（摘要 / 章节大纲 / 核心要点 / 金句），支持章节跳转播放、多格式导出和对话追问的自用 Web 工具。

## 功能

- **多平台链接**：B 站、小宇宙、YouTube、音频直链（yt-dlp + og:audio 页面降级），也支持本地 mp3 / m4a / wav 上传（≤500MB、≤6 小时）
- **自动转写**：百炼（DashScope）异步 ASR，逐句时间戳，段落式文稿视图，点击/跟随播放高亮
- **AI 结构化梳理**：DeepSeek 生成五板块文章（一句话摘要、全文总结、章节大纲、核心要点、金句摘录）
- **导读栏**：概要、章节速览（带摘要，跟随播放高亮）、核心要点、金句，时间戳均可跳转播放
- **多格式导出**：勾选式导出对话框——文章 DOCX/MD/TXT/HTML/PDF（打印页）、文稿 DOCX/SRT/TXT/MD（时间戳可开关）、音频 MP3/WAV/M4A
- **AI 对话追问**：基于全文的流式问答，回答中的时间戳可点击跳转，记录持久化
- **中断恢复**：服务重启后卡在半途的任务自动检测（alive 探活），一键从断点继续

## 技术栈

Next.js 16（App Router, Turbopack）+ TypeScript + Tailwind CSS 4 + Radix UI + Prisma 6 / SQLite + 百炼 ASR + DeepSeek（AI SDK v7）

## 本地运行

前置依赖：`yt-dlp`、`ffmpeg`（含 ffprobe）需在 PATH 中。

```bash
npm install
npx prisma migrate deploy   # 初始化 SQLite（dev.db）
cp .env.example .env        # 填写下面的环境变量
npm run dev                 # http://localhost:3000
```

环境变量（`.env`，不入库）：

- `DATABASE_URL` — SQLite 路径（如 `file:./dev.db`）
- `DASHSCOPE_API_KEY` — 百炼 ASR
- `DEEPSEEK_API_KEY` — DeepSeek 梳理/对话
- `ASR_MODEL` / `LLM_MODEL` — 可选，模型覆盖
- `ASR_MOCK` / `LLM_MOCK` — 设为 `1` 时用假数据调试（不烧 API）

## 目录速览

- `app/` — 页面与 API（episode 详情页、导出/对话/重试等路由）
- `lib/` — 任务管线：`tasks.ts`（下载）→ `asr.ts`（转写）→ `llm.ts`（梳理），`export.ts`（导出），`chapters.ts`（文章板块解析）
- `prisma/` — schema 与迁移（SQLite，`dev.db` 不入库）
- `audio/` — 下载/上传的音频（不入库）
- `docs/开发存档.md` — 开发进度、实测证据、已知问题与运维注意事项

## 已知限制

- 抖音链接有浏览器级风控（Argus），不支持
- 说话人分离未开启（文稿无"发言人"标签），见 `docs/开发存档.md` P2 事项
