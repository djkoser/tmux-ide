/**
 * Binary file placeholder. Solid port of emdash's
 * `binary-renderer.tsx`. Trivial JSX rewrite — same icon (`FileQuestion`),
 * same copy.
 */

import { FileQuestion } from "lucide-solid";
import type { ManagedFile } from "@/lib/editor/types";

interface BinaryRendererProps {
  file: ManagedFile;
}

export function BinaryRenderer(props: BinaryRendererProps) {
  const fileName = () => props.file.path.split("/").pop() ?? props.file.path;
  const ext = () => props.file.path.split(".").pop()?.toUpperCase();

  return (
    <div
      data-testid="editor-binary-renderer"
      class="flex h-full flex-col items-center justify-center gap-3 text-[var(--dim)]"
    >
      <FileQuestion class="h-10 w-10 opacity-30" />
      <div class="text-center">
        <p class="text-sm font-medium">{fileName()}</p>
        {ext() && <p class="mt-0.5 text-xs opacity-50">{ext()} file</p>}
        <p class="mt-1 text-xs opacity-70">Binary file — no preview available</p>
      </div>
    </div>
  );
}
