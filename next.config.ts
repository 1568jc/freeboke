import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隐藏左下角 Next.js 开发工具按钮（只有英文界面，仅开发模式出现，生产环境本就不显示）
  devIndicators: false,
};

export default nextConfig;
