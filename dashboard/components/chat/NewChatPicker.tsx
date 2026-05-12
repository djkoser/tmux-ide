"use client";

// Bot, Code2 kept: assigned together to a single `Icon` component variable; swapping one to a glyph would require new branching logic. Code2 also has no glyph in the supplied map.
import { Bot, Code2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  chatProvidersList,
  chatThreadCreate,
  type ProviderInfo,
  type RegisteredProject,
} from "@/lib/api";
import { useProjects } from "@/lib/projectStore";
import { useToasts } from "@/lib/useToasts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  StatusPill,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";

interface NewChatPickerProps {
  open: boolean;
  defaultSessionName: string | null;
  onClose(): void;
  onCreated(thread: { id: string; title: string; sessionName: string }): void;
}

export function NewChatPicker({
  open,
  defaultSessionName,
  onClose,
  onCreated,
}: NewChatPickerProps) {
  const { projects } = useProjects();
  const { push } = useToasts();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ProviderInfo["kind"] | null>(null);
  const [selectedSessionName, setSelectedSessionName] = useState(defaultSessionName ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedSessionName(defaultSessionName ?? projects[0]?.name ?? "");
  }, [defaultSessionName, open, projects]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProviders(true);
    setProviders([]);
    setSelectedKind(null);
    void chatProvidersList()
      .then((result) => {
        if (cancelled) return;
        setProviders(result.providers);
        setSelectedKind(result.providers.find((provider) => provider.available)?.kind ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        push({
          kind: "error",
          title: "Could not load chat providers",
          body: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingProviders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, push]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.kind === selectedKind) ?? null,
    [providers, selectedKind],
  );

  const selectedProject = useMemo(
    () => projectFor(projects, selectedSessionName, defaultSessionName),
    [defaultSessionName, projects, selectedSessionName],
  );
  const sessionName = selectedProject?.name ?? selectedSessionName ?? defaultSessionName ?? "";
  const canSubmit = Boolean(selectedProvider?.available && sessionName && !submitting);

  const submit = useCallback(async () => {
    if (!selectedProvider?.available || !sessionName) return;
    setSubmitting(true);
    try {
      const { thread } = await chatThreadCreate({
        provider: { kind: selectedProvider.kind },
        ...(selectedProject?.dir ? { projectDir: selectedProject.dir } : {}),
      });
      onCreated({ id: thread.id, title: thread.title, sessionName });
      onClose();
    } catch (error) {
      push({
        kind: "error",
        title: "Could not create chat",
        body: error instanceof Error ? error.message : String(error),
        ...(sessionName ? { scope: { project: sessionName } } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }, [onClose, onCreated, push, selectedProject?.dir, selectedProvider, sessionName]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        data-testid="new-chat-picker"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className="flex max-h-[min(680px,calc(100vh-80px))] w-[min(560px,calc(100vw-32px))] flex-col p-0"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader className="border-b border-[var(--border-weak)] px-4 pt-4 pb-3">
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>Choose an agent for this thread.</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
            {loadingProviders ? (
              <ProviderSkeletons />
            ) : (
              <div className="space-y-2" data-testid="new-chat-provider-list">
                {providers.map((provider) => (
                  <ProviderTile
                    key={provider.kind}
                    provider={provider}
                    selected={selectedKind === provider.kind}
                    onSelect={() => setSelectedKind(provider.kind)}
                  />
                ))}
                {providers.length === 0 && (
                  <div className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-weak)] px-3 py-6 text-center text-[12px] text-[var(--dim)]">
                    No chat providers returned by the daemon.
                  </div>
                )}
              </div>
            )}

            {projects.length > 1 && (
              <label className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-[var(--dim)]">Project</span>
                <select
                  data-testid="new-chat-project-select"
                  value={selectedSessionName}
                  onChange={(event) => setSelectedSessionName(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 text-[12px] text-[var(--fg)] outline-none focus-visible:focus-ring"
                >
                  {projects.map((project) => (
                    <option key={project.name} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <DialogFooter className="border-t border-[var(--border-weak)] px-4 py-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} isPending={submitting}>
              Create thread
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProviderSkeletons() {
  return (
    <div className="space-y-2" data-testid="new-chat-provider-skeletons">
      {Array.from({ length: 2 }, (_, index) => (
        <div
          key={index}
          className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-weak)] p-3"
        >
          <Skeleton h="h-4" w="w-40" />
          <Skeleton h="h-3" w="w-64" className="mt-3" />
        </div>
      ))}
    </div>
  );
}

function ProviderTile({
  provider,
  selected,
  onSelect,
}: {
  provider: ProviderInfo;
  selected: boolean;
  onSelect(): void;
}) {
  const Icon = provider.kind === "claude-code" ? Code2 : Bot;
  const tile = (
    <button
      type="button"
      data-testid={`new-chat-provider-${provider.kind}`}
      data-selected={selected ? "true" : "false"}
      disabled={!provider.available}
      title={!provider.available ? provider.error : undefined}
      onClick={onSelect}
      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-[var(--accent)] bg-[var(--surface-active)]"
          : "border-[var(--border-weak)] bg-[var(--bg-strong)] hover:bg-[var(--surface-hover)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Icon aria-hidden="true" size={18} className="text-[var(--accent)]" />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--fg)]">{provider.name}</span>
          {selected && (
            <span
              aria-hidden="true"
              className="text-[var(--accent)]"
              style={{ fontSize: 14, lineHeight: 1 }}
            >
              ✓
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-[11px] text-[var(--dim)]">
          {provider.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <StatusPill
          variant={provider.available ? "success" : "pending"}
          label={provider.available ? "available" : "not installed"}
        />
        {provider.version && (
          <span className="text-[11px] tabular-nums text-[var(--dim)]">{provider.version}</span>
        )}
      </span>
    </button>
  );

  if (provider.available || !provider.error) return tile;

  return (
    <Tooltip>
      <TooltipTrigger render={tile} />
      <TooltipContent side="top">{provider.error}</TooltipContent>
    </Tooltip>
  );
}

function projectFor(
  projects: RegisteredProject[],
  selectedSessionName: string,
  defaultSessionName: string | null,
): RegisteredProject | null {
  if (selectedSessionName) {
    return projects.find((project) => project.name === selectedSessionName) ?? null;
  }
  if (defaultSessionName) {
    return projects.find((project) => project.name === defaultSessionName) ?? null;
  }
  return projects[0] ?? null;
}
