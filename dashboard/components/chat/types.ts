export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string };

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";

export type AgentProvider =
  | { kind: "claude-code"; binary?: string }
  | { kind: "codex"; binary?: string }
  | { kind: "gemini"; binary?: string }
  | { kind: "custom"; command: string; args: string[]; env?: Record<string, string> };

export type ThreadIndexEntry = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  providerKind: AgentProvider["kind"];
  projectDir?: string;
  messageCount: number;
  lastStopReason?: StopReason;
};

export type ThreadState = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: AgentProvider;
  projectDir?: string;
  acpSessionId?: string;
  messages: ThreadMessage[];
};

export type ThreadMessage =
  | { _tag: "UserPrompt"; id: string; createdAt: string; content: ContentBlock[] }
  | { _tag: "AgentUpdate"; id: string; createdAt: string; update: SessionUpdate };

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export type ToolCall = {
  toolCallId: string;
  title: string;
  kind?: string | null;
  status?: ToolCallStatus | null;
  content?: ToolCallContent[] | null;
  locations?: unknown[] | null;
  rawInput?: unknown;
  rawOutput?: unknown;
};

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
};

export type PlanEntry = {
  content: string;
  status?: "pending" | "in_progress" | "completed";
  priority?: "low" | "medium" | "high";
};

export type AvailableCommand = {
  name: string;
  description?: string;
  input?: unknown;
};

export type ToolCallContent =
  | { type: "content"; content: ContentBlock }
  | { type: "diff"; path: string; oldText?: string | null; newText: string }
  | { type: "terminal"; terminalId: string };

export type SessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: ContentBlock; messageId?: string | null }
  | { sessionUpdate: "agent_thought_chunk"; content: ContentBlock; messageId?: string | null }
  | { sessionUpdate: "user_message_chunk"; content: ContentBlock; messageId?: string | null }
  | {
      sessionUpdate: "tool_call";
      toolCallId: string;
      title: string;
      kind?: string;
      status?: ToolCallStatus;
      content?: ToolCallContent[];
      locations?: unknown[];
      rawInput?: unknown;
      rawOutput?: unknown;
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId: string;
      title?: string | null;
      kind?: string | null;
      status?: ToolCallStatus | null;
      content?: ToolCallContent[] | null;
      locations?: unknown[] | null;
      rawInput?: unknown;
      rawOutput?: unknown;
    }
  | { sessionUpdate: "plan"; entries: PlanEntry[] }
  | { sessionUpdate: "available_commands_update"; availableCommands: AvailableCommand[] }
  | { sessionUpdate: "current_mode_update"; currentModeId: string }
  | { sessionUpdate: string; [k: string]: unknown };

export type ChatThreadUpdateEvent = {
  type: "chat.thread.update";
  threadId: string;
  update: SessionUpdate;
  seq: number;
};

export type ChatThreadStopEvent = {
  type: "chat.thread.stop";
  threadId: string;
  promptId: string;
  stopReason: StopReason;
};

export type ChatPermissionRequestEvent = {
  type: "chat.permission.request";
  threadId: string;
  requestId: string;
  toolCall: ToolCall;
  options: ReadonlyArray<PermissionOption>;
};

// ---------------------------------------------------------------------------
// T074: t3-style chat thread events. These are additive — the legacy
// `chat.thread.*` events above keep flowing through one release (until
// T080) so existing consumers keep working. The new events mirror
// @tmux-ide/contracts/chat-thread and are emitted by the daemon's
// per-store buses.
//
// UI subscribes and ignores them for now; rendering changes land in T076.
// Keep these types in sync with packages/contracts/src/chat-thread.ts.
// ---------------------------------------------------------------------------

export type ChatActivityAppendedEvent = {
  type: "chat.activity.appended";
  threadId: string;
  activity: {
    id: string;
    tone: "info" | "tool" | "approval" | "error";
    kind: string;
    summary: string;
    payload: unknown;
    turnId: string | null;
    sequence?: number;
    createdAt: string;
  };
  seq: number;
};

export type ChatTurnStartedEvent = {
  type: "chat.turn.started";
  threadId: string;
  turnId: string;
  requestedAt: string;
  sourceProposedPlanRef?: { threadId: string; planId: string };
};

export type ChatTurnCompletedEvent = {
  type: "chat.turn.completed";
  threadId: string;
  turnId: string;
  state: "running" | "interrupted" | "completed" | "error";
  completedAt: string;
  assistantMessageId?: string;
};

export type ChatTurnAbortedEvent = {
  type: "chat.turn.aborted";
  threadId: string;
  turnId: string;
  reason: "cancelled" | "interrupted" | "error";
};

export type ChatPlanUpsertedEvent = {
  type: "chat.plan.upserted";
  threadId: string;
  plan: {
    id: string;
    turnId: string | null;
    planMarkdown: string;
    implementedAt: string | null;
    implementationThreadId: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type ChatCheckpointCreatedEvent = {
  type: "chat.checkpoint.created";
  threadId: string;
  checkpoint: {
    turnId: string;
    checkpointTurnCount: number;
    checkpointRef: string;
    status: "ready" | "missing" | "error";
    files: Array<{ path: string; kind: string; additions: number; deletions: number }>;
    assistantMessageId: string | null;
    completedAt: string;
  };
};

export type ChatThreadRevertedEvent = {
  type: "chat.thread.reverted";
  threadId: string;
  toCheckpointRef: string;
};

export type ChatThreadV2Event =
  | ChatActivityAppendedEvent
  | ChatTurnStartedEvent
  | ChatTurnCompletedEvent
  | ChatTurnAbortedEvent
  | ChatPlanUpsertedEvent
  | ChatCheckpointCreatedEvent
  | ChatThreadRevertedEvent;

export type ChatBusEvent =
  | ChatThreadUpdateEvent
  | ChatThreadStopEvent
  | ChatPermissionRequestEvent
  | ChatThreadV2Event;

export type ChatMessage =
  | {
      id: string;
      role: "user";
      createdAt: string;
      content: ContentBlock[];
    }
  | {
      id: string;
      role: "assistant";
      createdAt: string;
      completedAt?: string;
      streaming: boolean;
      text: string;
      thoughtText?: string;
      toolCalls: ToolCallView[];
      stopReason?: StopReason;
    };

export interface ToolCallView {
  toolCallId: string;
  title: string;
  kind?: string;
  status: ToolCallStatus;
  content: ToolCallContent[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export type MessagesTimelineRow =
  | { kind: "message"; id: string; createdAt: string; message: ChatMessage }
  | { kind: "plan"; id: string; createdAt: string; entries: PlanEntry[] }
  | { kind: "working"; id: string; createdAt: string };
