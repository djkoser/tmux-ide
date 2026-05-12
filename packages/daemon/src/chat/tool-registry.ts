import type { z } from "zod";
import { createTmuxTools, type TmuxToolDeps, type ToolResult } from "./tools/tmux.ts";

export interface ChatTool<TIn = unknown, TOut = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TIn>;
  jsonSchema: Record<string, unknown>;
  handler: (input: TIn) => Promise<ToolResult<TOut>>;
}

export interface ChatToolRegistry {
  /** All registered tools, keyed by tool name. */
  readonly tools: ReadonlyMap<string, ChatTool>;
  list(): ChatTool[];
  get<TIn = unknown, TOut = unknown>(name: string): ChatTool<TIn, TOut> | undefined;
  /** ACP-style advertisement payload: name, description, JSON schema for inputs. */
  advertise(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}

export interface BuildChatToolRegistryOptions {
  session: string;
  tmuxDeps?: TmuxToolDeps;
  /** Additional tools to register beyond the built-in tmux ops. */
  extraTools?: ChatTool[];
}

/**
 * Build a ChatToolRegistry for a given tmux session. Always registers the
 * three built-in tmux ops (`send_to_pane`, `read_pane`, `capture_pane`) so
 * the chat agent (ACP or codex) can orchestrate panes once the registry is
 * wired into thread-manager.
 */
export function buildChatToolRegistry(opts: BuildChatToolRegistryOptions): ChatToolRegistry {
  const tmuxTools = createTmuxTools(opts.session, opts.tmuxDeps);
  const all: ChatTool[] = [
    tmuxTools.send_to_pane as unknown as ChatTool,
    tmuxTools.read_pane as unknown as ChatTool,
    tmuxTools.capture_pane as unknown as ChatTool,
    ...(opts.extraTools ?? []),
  ];
  const map = new Map<string, ChatTool>();
  for (const tool of all) {
    if (map.has(tool.name)) {
      throw new Error(`Duplicate chat tool registration: ${tool.name}`);
    }
    map.set(tool.name, tool);
  }
  return {
    tools: map,
    list: () => Array.from(map.values()),
    get: <TIn = unknown, TOut = unknown>(name: string) =>
      map.get(name) as ChatTool<TIn, TOut> | undefined,
    advertise: () =>
      Array.from(map.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.jsonSchema,
      })),
  };
}

export { createTmuxTools } from "./tools/tmux.ts";
export type {
  TmuxToolDeps,
  ToolResult,
  SendToPaneInput,
  SendToPaneOutput,
  ReadPaneInput,
  ReadPaneOutput,
  CapturePaneInput,
  CapturePaneOutput,
} from "./tools/tmux.ts";
