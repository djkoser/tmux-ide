import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(input: string): string {
  const dirty = marked.parse(input, { async: false }) as string;
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
