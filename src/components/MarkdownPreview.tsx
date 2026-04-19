"use client";

import { useState } from "react";
import { Copy, Download, Check } from "lucide-react";

interface Props {
  markdown: string;
  filename?: string;
}

export function MarkdownPreview({ markdown, filename = "script.md" }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={handleDownload}
          disabled={!markdown}
          className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Download className="h-4 w-4" /> Download .md
        </button>
      </div>

      <pre className="overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-300 whitespace-pre-wrap font-mono max-h-[600px]">
        {markdown || <span className="text-zinc-600 italic">Nothing to preview yet. Add scenes and blocks to see output.</span>}
      </pre>
    </div>
  );
}
