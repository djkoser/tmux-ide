import type { ThreadMessage, ToolCallContent } from "../types";

export interface ChangedFileEdit {
  oldText: string;
  newText: string;
  toolCallId: string;
  createdAt: string;
}

export interface ChangedFile {
  path: string;
  kind: "write" | "read";
  edits: ChangedFileEdit[];
  totalAdditions: number;
  totalDeletions: number;
}

interface MutableChangedFile extends ChangedFile {
  readSeenAt: string | null;
}

export function deriveChangedFiles(messages: ThreadMessage[]): ChangedFile[] {
  const files = new Map<string, MutableChangedFile>();

  for (const message of messages) {
    if (message._tag !== "AgentUpdate") continue;
    const update = message.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      continue;
    }

    const title = "title" in update && typeof update.title === "string" ? update.title : "";
    const toolCallId =
      "toolCallId" in update && typeof update.toolCallId === "string"
        ? update.toolCallId
        : message.id;

    const contents = "content" in update && Array.isArray(update.content) ? update.content : [];
    for (const content of contents) {
      if (content.type !== "diff") continue;
      addEdit(files, content, toolCallId, message.createdAt);
    }

    const rawInput = "rawInput" in update ? update.rawInput : undefined;
    const rawPath = firstPath(rawInput);
    if (rawPath && title.toLowerCase().includes("read")) {
      ensureFile(files, rawPath, "read", message.createdAt);
    }

    if (rawPath && isWriteLike(title, "kind" in update ? update.kind : undefined)) {
      const oldText = textField(rawInput, ["oldText", "old_text", "previous", "before"]) ?? "";
      const newText = textField(rawInput, ["newText", "new_text", "content", "after"]) ?? "";
      if (oldText || newText) {
        addEdit(
          files,
          { type: "diff", path: rawPath, oldText, newText },
          toolCallId,
          message.createdAt,
        );
      }
    }
  }

  return [...files.values()]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "write" ? -1 : 1;
      return a.path.localeCompare(b.path);
    })
    .map(({ readSeenAt: _readSeenAt, ...file }) => file);
}

function addEdit(
  files: Map<string, MutableChangedFile>,
  content: Extract<ToolCallContent, { type: "diff" }>,
  toolCallId: string,
  createdAt: string,
): void {
  const file = ensureFile(files, content.path, "write", createdAt);
  const oldText = content.oldText ?? "";
  const newText = content.newText;
  const stats = diffStats(oldText, newText);
  file.kind = "write";
  file.edits.push({ oldText, newText, toolCallId, createdAt });
  file.totalAdditions += stats.additions;
  file.totalDeletions += stats.deletions;
}

function ensureFile(
  files: Map<string, MutableChangedFile>,
  path: string,
  kind: ChangedFile["kind"],
  createdAt: string,
): MutableChangedFile {
  const existing = files.get(path);
  if (existing) {
    if (kind === "write") existing.kind = "write";
    if (kind === "read" && !existing.readSeenAt) existing.readSeenAt = createdAt;
    return existing;
  }

  const file: MutableChangedFile = {
    path,
    kind,
    edits: [],
    totalAdditions: 0,
    totalDeletions: 0,
    readSeenAt: kind === "read" ? createdAt : null,
  };
  files.set(path, file);
  return file;
}

function diffStats(oldText: string, newText: string): { additions: number; deletions: number } {
  const oldLines = lines(oldText);
  const newLines = lines(newText);
  const common = lcsLength(oldLines, newLines);
  return {
    additions: newLines.length - common,
    deletions: oldLines.length - common,
  };
}

function lines(text: string): string[] {
  if (!text) return [];
  const withoutTrailingNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
  return withoutTrailingNewline ? withoutTrailingNewline.split("\n") : [];
}

function lcsLength(left: string[], right: string[]): number {
  const previous = Array(right.length + 1).fill(0) as number[];
  const current = Array(right.length + 1).fill(0) as number[];

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        left[i - 1] === right[j - 1]
          ? previous[j - 1]! + 1
          : Math.max(previous[j]!, current[j - 1]!);
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return previous[right.length] ?? 0;
}

function isWriteLike(title: string, kind: unknown): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerKind = typeof kind === "string" ? kind.toLowerCase() : "";
  return (
    lowerKind.includes("edit") ||
    lowerKind.includes("write") ||
    lowerTitle.includes("edit") ||
    lowerTitle.includes("write")
  );
}

function firstPath(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if ("path" in value && typeof value.path === "string") return value.path;
  if ("filePath" in value && typeof value.filePath === "string") return value.filePath;
  if ("file_path" in value && typeof value.file_path === "string") return value.file_path;

  for (const child of Object.values(value)) {
    const found = firstPath(child);
    if (found) return found;
  }
  return null;
}

function textField(value: unknown, names: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const name of names) {
    if (typeof record[name] === "string") {
      return record[name];
    }
  }
  return null;
}
