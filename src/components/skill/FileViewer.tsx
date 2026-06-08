import { useState, useEffect } from "react";
import * as tauri from "../../lib/tauri";

interface FileViewerProps {
  skillId: string;
  relativePath: string;
}

export default function FileViewer({ skillId, relativePath }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    tauri
      .readSkillFile(skillId, relativePath)
      .then((text) => {
        setContent(text);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [skillId, relativePath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-status-broken">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-1 py-0.5 text-xs text-text-tertiary border-b border-border-subtle mb-1">
        {relativePath}
      </div>
      <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-words p-2 leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
