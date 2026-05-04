/**
 * Protocol contracts for the unified `/ws/events` WebSocket channel.
 *
 * This is the single push channel used by the dashboard to subscribe to
 * task / mission / milestone / goal / agent / event-log changes for one or
 * more sessions. It replaces a fan of individual SSE streams that hit
 * Chrome's 6-per-origin HTTP/1.1 limit.
 *
 * The shape of these frames is FROZEN — the dashboard imports them via
 * `@tmux-ide/schemas`. Add new frame variants by appending to the union; do
 * not rename existing fields.
 */

import { z } from "zod";
import { SessionOverviewSchemaZ, OrchestratorEventSchemaZ } from "./domain.ts";

// ---------------------------------------------------------------------------
// Snapshot payload — mirrors what `/api/project/<name>/stream` already pushes
// as its `snapshot` SSE event. Kept loose (passthrough) so that adding fields
// on the producer side does not require shipping schema updates lock-step
// with the dashboard. Consumers should validate fields they actually read.
// ---------------------------------------------------------------------------

// The snapshot payload is the existing SSE `snapshot` event body. We accept
// any object shape here because the producer can grow new fields without
// requiring lock-step schema updates on the consumer.
export const SessionSnapshotSchemaZ = z.record(z.string(), z.unknown());
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchemaZ>;

// ---------------------------------------------------------------------------
// Client → Server frames
// ---------------------------------------------------------------------------

const SubscribeFrameZ = z.object({
  type: z.literal("subscribe"),
  sessions: z.array(z.string()),
});

const UnsubscribeFrameZ = z.object({
  type: z.literal("unsubscribe"),
  sessions: z.array(z.string()),
});

const PingFrameZ = z.object({
  type: z.literal("ping"),
});

export const ClientFrameSchemaZ = z.discriminatedUnion("type", [
  SubscribeFrameZ,
  UnsubscribeFrameZ,
  PingFrameZ,
]);

export type ClientFrame = z.infer<typeof ClientFrameSchemaZ>;

// ---------------------------------------------------------------------------
// Server → Client frames
// ---------------------------------------------------------------------------

const HelloFrameZ = z.object({
  type: z.literal("hello"),
  sessions: z.array(SessionOverviewSchemaZ),
});

const SnapshotFrameZ = z.object({
  type: z.literal("snapshot"),
  sessionName: z.string(),
  data: SessionSnapshotSchemaZ,
});

const TaskChangedFrameZ = z.object({
  type: z.literal("task.changed"),
  sessionName: z.string(),
});

const MissionChangedFrameZ = z.object({
  type: z.literal("mission.changed"),
  sessionName: z.string(),
});

const MilestoneChangedFrameZ = z.object({
  type: z.literal("milestone.changed"),
  sessionName: z.string(),
});

const GoalChangedFrameZ = z.object({
  type: z.literal("goal.changed"),
  sessionName: z.string(),
});

const AgentChangedFrameZ = z.object({
  type: z.literal("agent.changed"),
  sessionName: z.string(),
});

const EventAppendedFrameZ = z.object({
  type: z.literal("event.appended"),
  sessionName: z.string(),
  event: OrchestratorEventSchemaZ,
});

const SessionsChangedFrameZ = z.object({
  type: z.literal("sessions.changed"),
});

const PongFrameZ = z.object({
  type: z.literal("pong"),
});

export const ServerFrameSchemaZ = z.discriminatedUnion("type", [
  HelloFrameZ,
  SnapshotFrameZ,
  TaskChangedFrameZ,
  MissionChangedFrameZ,
  MilestoneChangedFrameZ,
  GoalChangedFrameZ,
  AgentChangedFrameZ,
  EventAppendedFrameZ,
  SessionsChangedFrameZ,
  PongFrameZ,
]);

export type ServerFrame = z.infer<typeof ServerFrameSchemaZ>;
