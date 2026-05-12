import { Terminal } from "@/components/Terminal";
import Link from "next/link";

export default async function V2TerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[11px] tabular-nums">
        <Link href="/v2" className="mr-2 inline-flex items-center gap-1 text-[var(--dim)] hover:text-[var(--fg)]">
          <span aria-hidden="true">◇</span>
          <span>tmux-ide</span>
        </Link>
        <span className="mx-1 text-[var(--dimmer)]">/</span>
        <span aria-hidden="true" className="mr-1">{">_"}</span>
        <span className="font-medium text-[var(--accent)]">terminal</span>
        <span className="mx-2 text-[var(--dimmer)]">·</span>
        <span className="text-[var(--dim)]">{id}</span>
        <span className="flex-1" />
        <Link href="/v2" className="text-[var(--dim)] hover:text-[var(--fg)]">
          ← back
        </Link>
      </header>

      <main className="flex flex-1 min-h-0 flex-col">
        <Terminal id={id} />
      </main>

      <footer className="flex h-6 shrink-0 items-center border-t border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[10px] tabular-nums text-[var(--dim)]">
        <span className="text-[var(--accent)]">terminal</span>
        <span className="mx-2 opacity-30">│</span>
        <span>{id}</span>
        <span className="flex-1" />
        <span>tmux-ide v2</span>
      </footer>
    </div>
  );
}
