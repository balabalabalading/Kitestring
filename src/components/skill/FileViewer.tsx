import { useState, useEffect } from "react";
import * as tauri from "../../lib/tauri";

interface FileViewerProps {
  skillSourcePath: string;
  relativePath: string;
}

export default function FileViewer({ skillSourcePath, relativePath }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Construct absolute path: source_path + relative_path
    const absolutePath = `${skillSourcePath}/${relativePath}`;
    tauri
      .readSkillFile(absolutePath)
      .then((text) => {
        setContent(text);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [skillSourcePath, relativePath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#86868b]">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-1 py-0.5 text-xs text-[#86868b] border-b border-gray-100 mb-1">
        {relativePath}
      </div>
      <pre className="text-xs font-mono text-[#1d1d1f] whitespace-pre-wrap break-words p-2 leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
