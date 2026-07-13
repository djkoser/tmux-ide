"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Editor, defaultValueCtx, rootCtx, editorViewCtx, serializerCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import "@milkdown/theme-nord/style.css";

interface MarkdownEditorProps {
  value: string;
  /** Ctrl/Cmd+S from inside the editor. The owner reads live markdown via the ref and persists. */
  onRequestSave: () => void;
}

export interface MarkdownEditorHandle {
  /**
   * Serialize the current editor document to markdown. Returns null when the
   * editor instance is not yet mounted. Throws if the document cannot be
   * serialized — callers must treat a throw as a hard save failure and must
   * NOT persist a stale fallback in its place.
   */
  getLiveMarkdown: () => string | null;
}

const MilkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MilkdownEditor({ value, onRequestSave }, ref) {
    const onRequestSaveRef = useRef(onRequestSave);
    onRequestSaveRef.current = onRequestSave;

    useEditor((root) => {
      return Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
        })
        .config(nord)
        .use(commonmark);
    }, []);

    const [loading, getInstance] = useInstance();

    // Serialize the live editor document straight from ProseMirror's committed
    // state. editorViewCtx/serializerCtx are read from this same @milkdown/core
    // instance — the one that created the editor and registered those ctx
    // slices — so the lookup always resolves. (Routing through
    // @milkdown/utils' getMarkdown pulled a second, version-skewed core whose
    // slice identities did not match, making the lookup miss and throw.)
    const serialize = useCallback((): string | null => {
      if (loading) return null;
      const editor = getInstance();
      if (!editor) return null;
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const serializer = ctx.get(serializerCtx);
        return serializer(view.state.doc);
      });
    }, [loading, getInstance]);

    useImperativeHandle(ref, () => ({ getLiveMarkdown: serialize }), [serialize]);

    // Ctrl+S / Cmd+S — delegate to the owner, which reads live markdown via the
    // ref and applies the block-on-failure save policy.
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          onRequestSaveRef.current();
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
      <div className="milkdown-wrap flex-1 min-h-0 overflow-auto">
        <Milkdown />
      </div>
    );
  },
);

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(props, ref) {
    return (
      <MilkdownProvider>
        <MilkdownEditor {...props} ref={ref} />
      </MilkdownProvider>
    );
  },
);
