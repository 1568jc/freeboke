"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

/** 历史记录行内删除按钮：确认后调 DELETE 并刷新列表 */
export function DeleteEpisodeButton({ episodeId, title }: { episodeId: number; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const onDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // 阻止触发整行 Link 跳转
    e.stopPropagation();
    if (!window.confirm(`删除「${title}」？文稿、文章、对话记录和音频文件都会清除，不可恢复。`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "删除失败");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={onDelete}
      disabled={deleting}
      className="ml-2 shrink-0 rounded-lg p-1.5 text-weak transition-colors hover:bg-line/40 hover:text-ink disabled:opacity-40"
      title="删除该记录"
      aria-label="删除该记录"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
