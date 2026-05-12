import { describe, expect, it } from "vitest";
import { findGroupByTurn, groupActivitiesByTurn, isInFlight } from "../turnGrouping";
import type { ActivityView, TurnSummary } from "../useChatStore";

function activity(
  turnId: string | null,
  id: string,
  overrides: Partial<ActivityView> = {},
): ActivityView {
  return {
    id,
    tone: "info",
    kind: "step",
    summary: id,
    payload: null,
    turnId,
    sequence: 0,
    createdAt: "2026-05-11T10:00:00.000Z",
    ...overrides,
  };
}

function turn(turnId: string, overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    threadId: "thr_a",
    turnId,
    state: "running",
    requestedAt: "2026-05-11T10:00:00.000Z",
    completedAt: null,
    assistantMessageId: null,
    ...overrides,
  };
}

describe("groupActivitiesByTurn", () => {
  it("returns an empty array when there are no activities or turns", () => {
    expect(groupActivitiesByTurn({ activities: [], turns: {} })).toEqual([]);
  });

  it("partitions activities into one group per turnId in first-seen order", () => {
    const result = groupActivitiesByTurn({
      activities: [
        activity("t1", "a"),
        activity("t1", "b"),
        activity("t2", "c"),
        activity("t1", "d"),
      ],
      turns: {},
    });
    expect(result.map((g) => g.turnId)).toEqual(["t1", "t2"]);
    expect(result[0]?.activities.map((a) => a.id)).toEqual(["a", "b", "d"]);
    expect(result[1]?.activities.map((a) => a.id)).toEqual(["c"]);
  });

  it("places ambient (turnId=null) activities in a separate group with ordinal 0", () => {
    const result = groupActivitiesByTurn({
      activities: [activity(null, "ambient"), activity("t1", "x")],
      turns: {},
    });
    expect(result[0]?.turnId).toBeNull();
    expect(result[0]?.ordinal).toBe(0);
    expect(result[1]?.ordinal).toBe(1);
  });

  it("assigns 1-based ordinals to turn groups in declaration order", () => {
    const result = groupActivitiesByTurn({
      activities: [activity("t1", "a"), activity("t2", "b"), activity("t3", "c")],
      turns: {},
    });
    expect(result.map((g) => g.ordinal)).toEqual([1, 2, 3]);
  });

  it("inherits state + timestamps from the turn record when available", () => {
    const result = groupActivitiesByTurn({
      activities: [activity("t1", "a")],
      turns: {
        t1: turn("t1", { state: "completed", completedAt: "2026-05-11T10:01:00.000Z" }),
      },
    });
    expect(result[0]?.state).toBe("completed");
    expect(result[0]?.completedAt).toBe("2026-05-11T10:01:00.000Z");
  });

  it("includes turns with zero activities (started-but-empty edge case)", () => {
    const result = groupActivitiesByTurn({
      activities: [],
      turns: { t1: turn("t1") },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.turnId).toBe("t1");
  });

  it("marks running turns as unfinished", () => {
    const result = groupActivitiesByTurn({
      activities: [activity("t1", "a")],
      turns: { t1: turn("t1", { state: "running" }) },
    });
    expect(result[0]?.unfinished).toBe(true);
  });

  it("does not mark completed turns as unfinished", () => {
    const result = groupActivitiesByTurn({
      activities: [activity("t1", "a")],
      turns: { t1: turn("t1", { state: "completed" }) },
    });
    expect(result[0]?.unfinished).toBe(false);
  });

  it("ambient bucket is never unfinished", () => {
    const result = groupActivitiesByTurn({
      activities: [activity(null, "a")],
      turns: {},
    });
    expect(result[0]?.unfinished).toBe(false);
  });

  it("preserves activity insertion order inside a group", () => {
    const result = groupActivitiesByTurn({
      activities: [
        activity("t1", "a"),
        activity("t1", "b"),
        activity("t1", "c"),
      ],
      turns: {},
    });
    expect(result[0]?.activities.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("findGroupByTurn returns the matching group or undefined", () => {
    const groups = groupActivitiesByTurn({
      activities: [activity("t1", "a"), activity("t2", "b")],
      turns: {},
    });
    expect(findGroupByTurn(groups, "t2")?.turnId).toBe("t2");
    expect(findGroupByTurn(groups, "missing")).toBeUndefined();
  });

  it("isInFlight is true for running-state groups", () => {
    const groups = groupActivitiesByTurn({
      activities: [activity("t1", "a")],
      turns: { t1: turn("t1", { state: "running" }) },
    });
    expect(isInFlight(groups[0]!)).toBe(true);
  });
});
