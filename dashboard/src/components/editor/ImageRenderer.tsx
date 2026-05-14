/**
 * Image renderer — fetches the file via the daemon's
 * `/api/project/:name/image/:file` endpoint, which returns a base64
 * `data:` URL with the right MIME. Falls back to `file.content` if a
 * session name isn't provided (preserves the pre-G17 callsite that
 * fed a data URL directly).
 */

import { createResource, Show, type JSX } from "solid-js";
import type { ManagedFile } from "@/lib/editor/types";

interface ImageRendererProps {
  file: ManagedFile;
  sessionName?: string;
}

async function fetchImageDataUrl(sessionName: string, filePath: string): Promise<string> {
  const normalized = filePath.replace(/^\/+/g, "");
  const url = `/api/project/${encodeURIComponent(sessionName)}/image/${encodeURI(normalized)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const body = (await res.json()) as { dataUrl: string };
  return body.dataUrl;
}

export function ImageRenderer(props: ImageRendererProps): JSX.Element {
  const fileName = () => props.file.path.split("/").pop() ?? props.file.path;
  const [dataUrl] = createResource<string | null, { sessionName: string; path: string }>(
    () =>
      props.sessionName
        ? { sessionName: props.sessionName, path: props.file.path }
        : (null as unknown as { sessionName: string; path: string }),
    async (key) => {
      if (!key) return null;
      try {
        return await fetchImageDataUrl(key.sessionName, key.path);
      } catch {
        return null;
      }
    },
  );

  const src = () => {
    if (props.sessionName) {
      const fetched = dataUrl();
      return fetched ?? "";
    }
    // Legacy path: caller embedded the data URL directly into
    // `file.content`.
    return props.file.content;
  };

  return (
    <div
      data-testid="editor-image-renderer"
      class="flex h-full items-center justify-center overflow-auto p-4"
    >
      <Show
        when={src()}
        fallback={
          <Show
            when={!dataUrl.loading}
            fallback={<span class="text-[11px] text-[var(--dim)]">loading…</span>}
          >
            <span class="text-[11px] text-[var(--red-foreground,var(--red))]">
              Failed to load image
            </span>
          </Show>
        }
      >
        <img src={src()} alt={fileName()} class="max-h-full max-w-full object-contain" />
      </Show>
    </div>
  );
}
