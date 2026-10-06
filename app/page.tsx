import { HomeForm } from "./home-form";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">把播客变成 10 分钟读完的文章</h1>
        <p className="text-sm text-sub">
          粘贴链接或上传音频，自动转写并梳理成结构化文章
        </p>
      </div>
      <HomeForm />
    </div>
  );
}
