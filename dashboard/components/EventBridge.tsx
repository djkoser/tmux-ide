"use client";

import { useEffect } from "react";
import { playSound } from "@/lib/sounds";
import { getSettingsSnapshot } from "@/lib/useSettings";
import { useNotifications } from "@/lib/useNotifications";
import { useToasts, type ToastInput } from "@/lib/useToasts";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";

interface EventPayload {
  session?: string;
  timestamp?: string;
  type?: string;
  taskId?: string;
  agent?: string;
  message?: string;
  milestoneId?: string;
  title?: string;
  reason?: string;
  failedCount?: number;
}

function hashStable(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function eventToast(payload: EventPayload, id: string): ToastInput | null {
  const project = payload.session;
  const scope = project ? { project } : undefined;
  const task = payload.taskId ? `task ${payload.taskId}` : "task";
  const message = payload.message || payload.title;

  switch (payload.type) {
    case "completion":
      return { id, kind: "success", title: "Task completed", body: message ?? task, scope };
    case "error":
      return { id, kind: "error", title: "Task failed", body: message ?? task, scope };
    case "dispatch":
      return {
        id,
        kind: "info",
        title: `Dispatched ${payload.taskId ?? "task"}`,
        body: message,
        scope,
      };
    case "milestone_complete":
      return {
        id,
        kind: "success",
        title: `Milestone complete: ${payload.milestoneId ?? payload.title ?? "milestone"}`,
        body: payload.title,
        scope,
      };
    case "stall":
      return {
        id,
        kind: "warning",
        title: `${payload.agent ?? "Agent"} idle 5m+`,
        body: message,
        scope,
      };
    case "validation_failed":
      return {
        id,
        kind: "error",
        title: `Validation failed: ${payload.milestoneId ?? payload.title ?? "milestone"}`,
        body:
          message ??
          (payload.failedCount != null ? `${payload.failedCount} assertion(s) failed` : undefined),
        scope,
      };
    case "mission_complete":
      return { id, kind: "success", title: "Mission complete", body: payload.title, scope };
    case "retry":
      return {
        id,
        kind: "warning",
        title: `Retrying ${payload.taskId ?? "task"}`,
        body: message,
        scope,
      };
    default:
      return null;
  }
}

export function EventBridge() {
  const { push: pushToast } = useToasts();
  const { push: pushNotification } = useNotifications();

  useEffect(() => {
    const mountedAt = Date.now();
    const seen = new Set<string>();

    function handleFrame(frame: ServerFrame) {
      if (frame.type !== "event.appended") return;
      const event = frame.event as EventPayload;
      const payload: EventPayload = {
        // Spread server-provided fields first, then pin the canonical fields
        // so the wire-level frame's `sessionName` always wins as `session`
        // and the typed event field wins as `type`.
        ...event,
        session: frame.sessionName,
        type: event.type,
      };

      const eventTime = payload.timestamp ? new Date(payload.timestamp).getTime() : mountedAt;
      if (Number.isFinite(eventTime) && eventTime < mountedAt) return;

      const stableId = `event:${hashStable(`${payload.type ?? "event"}:${payload.timestamp ?? ""}:${payload.taskId ?? ""}:${payload.message ?? ""}`)}`;
      if (seen.has(stableId)) return;
      seen.add(stableId);

      const toast = eventToast(payload, stableId);
      if (!toast) return;

      pushToast(toast);
      if (getSettingsSnapshot().general.showNotifications) {
        pushNotification({
          id: stableId,
          kind: toast.kind,
          title: toast.title,
          ...(toast.body ? { body: toast.body } : {}),
          ...(toast.scope ? { scope: toast.scope } : {}),
        });
      }

      if (payload.type === "completion" || payload.type === "mission_complete") {
        playSound("complete");
      } else if (payload.type === "error" || payload.type === "validation_failed") {
        playSound("error");
      } else if (payload.type === "stall") {
        playSound("idle");
      }
    }

    return subscribeGlobal(handleFrame);
  }, [pushNotification, pushToast]);

  return null;
}
