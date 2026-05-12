"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Terminal } from "@/components/Terminal";
import { fetchWidgetSpawn, type WidgetSpawnSpec } from "@/lib/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; spec: WidgetSpawnSpec; id: string }
  | { kind: "error"; message: string };

export default function WidgetMirrorPage() {
  const params = useParams<{ name: string }>();
  const search = useSearchParams();
  const widgetName = params?.name ?? "";

  const session = search?.get("session") ?? "";
  const dir = search?.get("dir") ?? "";
  const target = search?.get("target");
  const themeRaw = search?.get("theme");

  const bridgeId = useMemo(() => {
    const t = target ?? "*";
    return `widget:${widgetName}:${session}:${t}`;
  }, [widgetName, session, target]);

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!widgetName || !session || !dir) {
      setState({ kind: "error", message: "missing widget name, session, or dir query params" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let theme: unknown = undefined;
        if (themeRaw) {
          try {
            theme = JSON.parse(themeRaw);
          } catch {
            throw new Error("theme query param must be valid JSON");
          }
        }
        const fetchParams: { session: string; dir: string; target?: string; theme?: unknown } = {
          session,
          dir,
        };
        if (target) fetchParams.target = target;
        if (theme !== undefined) fetchParams.theme = theme;
        const spec = await fetchWidgetSpawn(widgetName, fetchParams);
        if (cancelled) return;
        setState({ kind: "ready", spec, id: bridgeId });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widgetName, session, dir, target, themeRaw, bridgeId]);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[11px] tabular-nums">
        <Link href="/v2" className="mr-2 inline-flex items-center gap-1 text-[var(--dim)] hover:text-[var(--fg)]">
          <span aria-hidden="true">◇</span>
          <span>tmux-ide</span>
        </Link>
        <span className="mx-1 text-[var(--dimmer)]">/</span>
        <span>widget</span>
        <span className="mx-1 text-[var(--dimmer)]">/</span>
        <span className="font-medium text-[var(--accent)]">{widgetName}</span>
        {session && (
          <>
            <span className="mx-1 text-[var(--dimmer)]">·</span>
            <span className="text-[var(--fg-secondary)]">{session}</span>
          </>
        )}
        {target && (
          <>
            <span className="mx-1 text-[var(--dimmer)]">·</span>
            <span className="truncate text-[var(--dim)]">{target}</span>
          </>
        )}
        <span className="flex-1" />
        <span className="text-[var(--dim)]">PTY mirror</span>
      </header>

      <div className="flex-1 min-h-0">
        {state.kind === "loading" && (
          <div className="flex h-full items-center justify-center text-[var(--dim)]">
            resolving widget…
          </div>
        )}
        {state.kind === "error" && (
          <div className="flex h-full items-center justify-center px-6 text-center text-[var(--red)]">
            <div>
              <div className="mb-2 text-[12px] uppercase tracking-wider">widget unavailable</div>
              <div className="text-[11px] text-[var(--dim)]">{state.message}</div>
            </div>
          </div>
        )}
        {state.kind === "ready" && (
          <Terminal
            id={state.id}
            className="h-full w-full"
            showHeader={false}
            cwd={state.spec.cwd}
            cmd={state.spec.cmd}
          />
        )}
      </div>
    </div>
  );
}
