import { HomeForm } from "./home-form";
import {
  FileText,
  Link2,
  MessageSquare,
  Download,
  Sparkles,
  ListMusic,
} from "lucide-react";

const FEATURES = [
  {
    icon: Link2,
    title: "多平台链接",
    desc: "B 站、小宇宙、YouTube、音频直链，粘贴即处理，也可上传本地文件",
  },
  {
    icon: FileText,
    title: "带时间戳文稿",
    desc: "自动转写全文，逐句时间戳，点击即可跳转播放对应位置",
  },
  {
    icon: Sparkles,
    title: "AI 结构化梳理",
    desc: "一句话摘要、章节大纲、核心要点、金句摘录一次生成",
  },
  {
    icon: ListMusic,
    title: "章节速览跳转",
    desc: "右侧导读栏跟随播放高亮，章节、金句一键定位",
  },
  {
    icon: Download,
    title: "多格式导出",
    desc: "文章 DOCX / MD / PDF，文稿 SRT / TXT，音频 MP3 / WAV 灵活勾选",
  },
  {
    icon: MessageSquare,
    title: "AI 对话追问",
    desc: "针对单集内容自由提问，回答标注时间戳并可跳转试听",
  },
];

const STEPS = [
  {
    title: "粘贴链接或上传",
    desc: "支持 B 站、小宇宙、YouTube、音频直链，以及本地 mp3 / m4a / wav 文件",
  },
  {
    title: "自动转写并梳理",
    desc: "语音识别生成带时间戳的全文文稿，AI 再梳理成结构化文章",
  },
  {
    title: "阅读、导出、追问",
    desc: "10 分钟读完一期播客，按需导出文档，或向 AI 继续追问细节",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* Hero */}
      <div className="space-y-5 pt-16 pb-10 text-center">
        <span className="inline-block rounded-full border border-line bg-paper px-3 py-1 text-xs text-sub">
          支持 B 站 · 小宇宙 · YouTube · 音频直链
        </span>
        <h1 className="text-4xl font-bold tracking-tight">
          把播客变成 <span className="text-brand">10 分钟</span>读完的文章
        </h1>
        <p className="text-sm text-sub">
          粘贴链接或上传音频，自动转写并梳理成结构化文章
        </p>
      </div>

      {/* 输入区（链接/上传切换） */}
      <div className="mx-auto max-w-2xl">
        <HomeForm />
      </div>

      {/* 功能卡片 */}
      <div id="features" className="scroll-mt-20 pt-20">
        <h2 className="text-center text-2xl font-bold">
          为什么选择 <span className="text-brand">播客转文字稿</span>
        </h2>
        <p className="mt-2 text-center text-sm text-sub">
          简单、快速的一站式的播客内容整理体验
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-line bg-paper p-5 shadow-[0_1px_4px_rgba(31,35,41,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(31,35,41,0.08)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-highlight">
                <f.icon className="h-4.5 w-4.5 text-brand" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs leading-5 text-sub">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 使用步骤 */}
      <div id="steps" className="scroll-mt-20 pt-20">
        <h2 className="text-center text-2xl font-bold">如何使用</h2>
        <p className="mt-2 text-center text-sm text-sub">只需 3 步</p>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-highlight text-base font-semibold text-brand">
                {i + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-sub">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
