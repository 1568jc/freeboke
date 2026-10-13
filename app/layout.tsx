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
      <body className="min-h-full bg-pagebg font-sans text-ink flex flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-paper">
          <nav className="relative mx-auto flex max-w-[1500px] items-center px-4 py-3 md:px-10">
            <Link href="/" className="text-xl font-semibold">
              播客转文字稿
            </Link>
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-6">
              <Link href="/#features" className="text-sm text-sub hover:text-ink">
                功能特性
              </Link>
              <Link href="/#steps" className="text-sm text-sub hover:text-ink">
                使用教程
              </Link>
              <Link href="/history" className="text-sm text-sub hover:text-ink">
                历史记录
              </Link>
            </div>
          </nav>
        </header>
        <main className="w-full flex-1">{children}</main>
      </body>
    </html>
  );
}
