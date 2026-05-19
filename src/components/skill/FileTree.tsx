import { useState } from "react";
import type { FileNode } from "../../lib/tauri";

interface FileTreeProps {
  nodes: FileNode[];
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  baseDepth?: number;
}

export default function FileTree({ nodes, onFileSelect, selectedPath, baseDepth = 0 }: FileTreeProps) {
  return (
    <div className="text-sm font-mono">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
          depth={baseDepth}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  depth: number;
}

function FileTreeNode({ node, onFileSelect, selectedPath, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.is_dir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-1.5 py-0.5 hover:bg-bg-surface rounded-radius-sm flex items-center gap-1.5 text-text-primary transition-colors"
          style={{ paddingLeft: `${depth * 16 + 6}px` }}
        >
          <span className="text-[10px] text-text-tertiary w-3 text-center">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="text-xs">{node.name}</span>
        </button>
        {expanded && node.children && (
          <FileTree
            nodes={node.children}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
            baseDepth={depth + 1}
          />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={`w-full text-left px-1.5 py-0.5 rounded-radius-sm flex items-center gap-1.5 transition-colors ${
        selectedPath === node.path
          ? "bg-accent-sky-soft text-accent-sky"
          : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
      }`}
      style={{ paddingLeft: `${depth * 16 + 22}px` }}
    >
      <span className="text-xs truncate">{node.name}</span>
    </button>
  );
}
