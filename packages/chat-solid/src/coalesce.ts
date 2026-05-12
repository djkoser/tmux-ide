import type {
  AvailableCommand,
  ChatMessage,
  MessagesTimelineRow,
  SessionUpdate,
  StopReason,
  ThreadMessage,
  ToolCallContent,
  ToolCallStatus,
  ToolCallView,
} from "./types";

export interface CoalesceRuntime {
  inflight?: boolean;
  stopReason?: StopReason | null;
  completedAt?: string | null;
}

export function coalesceMessages(
  messages: readonly ThreadMessage[],
  runtime: CoalesceRuntime = {},
): MessagesTimelineRow[] {
  const rows: MessagesTimelineRow[] = [];
  let currentAssistant: Extract<ChatMessage, { role: "assistant" }> | null = null;
  let currentPlanRowId: string | null = null;
  let latestUserMessage: Extract<ChatMessage, { role: "user" }> | null = null;
  let latestAssistantRow: Extract<MessagesTimelineRow, { kind: "message" }> | null = null;
  let turnIndex = -1;

  for (const message of messages) {
    if (message._tag === "UserPrompt") {
      turnIndex += 1;
      currentAssistant = null;
      currentPlanRowId = null;
      const userMessage: Extract<ChatMessage, { role: "user" }> = {
        id: message.id,
        role: "user",
        createdAt: message.createdAt,
        content: [...message.content],
      };
      latestUserMessage = userMessage;
      rows.push({
        kind: "message",
        id: message.id,
        createdAt: message.createdAt,
        message: userMessage,
      });
      continue;
    }

    const assistant = ensureAssistantMessage({
      rows,
      currentAssistant,
      source: message,
      turnIndex,
    });
    currentAssistant = assistant.message;
    latestAssistantRow = assistant.row;

    switch (message.update.sessionUpdate) {
      case "agent_message_chunk": {
        const update = message.update as Extract<
          SessionUpdate,
          { sessionUpdate: "agent_message_chunk" }
        >;
        if (update.content.type === "text") currentAssistant.text += update.content.text;
        break;
      }
      case "agent_thought_chunk": {
        const update = message.update as Extract<
          SessionUpdate,
          { sessionUpdate: "agent_thought_chunk" }
        >;
        if (update.content.type === "text") {
          currentAssistant.thoughtText = `${currentAssistant.thoughtText ?? ""}${update.content.text}`;
        }
        break;
      }
      case "user_message_chunk": {
        const update = message.update as Extract<
          SessionUpdate,
          { sessionUpdate: "user_message_chunk" }
        >;
        if (latestUserMessage)
          latestUserMessage.content = [...latestUserMessage.content, update.content];
        break;
      }
      case "tool_call": {
        const update = message.update as Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;
        currentAssistant.toolCalls.push({
          toolCallId: update.toolCallId,
          title: update.title,
          ...(update.kind ? { kind: update.kind } : {}),
          status: update.status ?? "pending",
          content: [...(update.content ?? [])],
          ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
          ...(update.rawOutput !== undefined ? { rawOutput: update.rawOutput } : {}),
        });
        break;
      }
      case "tool_call_update": {
        const update = message.update as Extract<
          SessionUpdate,
          { sessionUpdate: "tool_call_update" }
        >;
        mergeToolCallUpdate(currentAssistant.toolCalls, {
          toolCallId: update.toolCallId,
          title: update.title ?? undefined,
          kind: update.kind ?? undefined,
          status: update.status ?? undefined,
          content: update.content ?? undefined,
          rawInput: update.rawInput,
          rawOutput: update.rawOutput,
        });
        break;
      }
      case "plan": {
        const update = message.update as Extract<SessionUpdate, { sessionUpdate: "plan" }>;
        const planRow: Extract<MessagesTimelineRow, { kind: "plan" }> = {
          kind: "plan",
          id: currentPlanRowId ?? `plan:${message.id}`,
          createdAt: message.createdAt,
          entries: [...update.entries],
        };
        if (currentPlanRowId) {
          const existingIndex = rows.findIndex((row) => row.id === currentPlanRowId);
          if (existingIndex !== -1) rows[existingIndex] = planRow;
        } else {
          currentPlanRowId = planRow.id;
          rows.push(planRow);
        }
        break;
      }
      case "available_commands_update":
      case "current_mode_update":
        break;
      default:
        break;
    }
  }

  if (latestAssistantRow?.message.role === "assistant") {
    const assistant = latestAssistantRow.message;
    if (runtime.inflight) {
      assistant.streaming = true;
      if (!assistantHasVisibleContent(assistant)) {
        rows.push({
          kind: "working",
          id: `${assistant.id}:working`,
          createdAt: assistant.createdAt,
        });
      }
    } else if (runtime.stopReason) {
      assistant.streaming = false;
      assistant.stopReason = runtime.stopReason;
      if (runtime.completedAt) assistant.completedAt = runtime.completedAt;
    }
  }

  return rows;
}

export function deriveRuntimeState(messages: readonly ThreadMessage[]): {
  availableCommands: AvailableCommand[];
  currentModeId: string | null;
} {
  let availableCommands: AvailableCommand[] = [];
  let currentModeId: string | null = null;

  for (const message of messages) {
    if (message._tag !== "AgentUpdate") continue;
    if (message.update.sessionUpdate === "available_commands_update") {
      const update = message.update as Extract<
        SessionUpdate,
        { sessionUpdate: "available_commands_update" }
      >;
      availableCommands = [...update.availableCommands];
    }
    if (message.update.sessionUpdate === "current_mode_update") {
      const update = message.update as Extract<
        SessionUpdate,
        { sessionUpdate: "current_mode_update" }
      >;
      currentModeId = update.currentModeId;
    }
  }

  return { availableCommands, currentModeId };
}

function ensureAssistantMessage(input: {
  rows: MessagesTimelineRow[];
  currentAssistant: Extract<ChatMessage, { role: "assistant" }> | null;
  source: Extract<ThreadMessage, { _tag: "AgentUpdate" }>;
  turnIndex: number;
}): {
  message: Extract<ChatMessage, { role: "assistant" }>;
  row: Extract<MessagesTimelineRow, { kind: "message" }>;
} {
  if (input.currentAssistant) {
    const row = input.rows.find(
      (candidate): candidate is Extract<MessagesTimelineRow, { kind: "message" }> =>
        candidate.kind === "message" && candidate.message === input.currentAssistant,
    );
    if (row) return { message: input.currentAssistant, row };
  }

  const id = `assistant:${input.turnIndex < 0 ? "orphan" : input.turnIndex}:${input.source.id}`;
  const message: Extract<ChatMessage, { role: "assistant" }> = {
    id,
    role: "assistant",
    createdAt: input.source.createdAt,
    streaming: false,
    text: "",
    toolCalls: [],
  };
  const row: Extract<MessagesTimelineRow, { kind: "message" }> = {
    kind: "message",
    id,
    createdAt: input.source.createdAt,
    message,
  };
  input.rows.push(row);
  return { message, row };
}

function mergeToolCallUpdate(
  toolCalls: ToolCallView[],
  update: {
    toolCallId: string;
    title?: string;
    kind?: string;
    status?: ToolCallStatus;
    content?: ToolCallContent[];
    rawInput?: unknown;
    rawOutput?: unknown;
  },
): void {
  let toolCall = toolCalls.find((candidate) => candidate.toolCallId === update.toolCallId);
  if (!toolCall) {
    toolCall = {
      toolCallId: update.toolCallId,
      title: update.title ?? update.toolCallId,
      ...(update.kind ? { kind: update.kind } : {}),
      status: update.status ?? "pending",
      content: [],
    };
    toolCalls.push(toolCall);
  }

  if (update.title) toolCall.title = update.title;
  if (update.kind) toolCall.kind = update.kind;
  if (update.status) toolCall.status = update.status;
  if (update.content?.length) toolCall.content = [...toolCall.content, ...update.content];
  if (update.rawInput !== undefined) toolCall.rawInput = update.rawInput;
  if (update.rawOutput !== undefined) toolCall.rawOutput = update.rawOutput;
}

function assistantHasVisibleContent(message: Extract<ChatMessage, { role: "assistant" }>): boolean {
  return (
    message.text.length > 0 ||
    Boolean(message.thoughtText && message.thoughtText.length > 0) ||
    message.toolCalls.length > 0
  );
}
