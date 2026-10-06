import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "播客转文字稿",
  description: "播客/音频 → 带时间戳文字稿 → 结构化文章",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-paper font-sans text-ink flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-[1500px] items-center gap-6 px-10 py-3">
            <Link href="/" className="text-xl font-semibold">
              播客转文字稿
            </Link>
            <Link href="/history" className="text-sm text-sub hover:text-ink">
              历史记录
            </Link>
          </nav>
        </header>
        <main className="w-full flex-1">{children}</main>
      </body>
    </html>
  );
}
