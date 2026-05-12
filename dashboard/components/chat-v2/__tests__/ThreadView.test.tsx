import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThreadView } from "../ThreadView";
import type { ActivityView, CheckpointSummaryView, ProposedPlanView, TurnSummary } from "../useChatStore";
import type { ThreadIndexEntry } from "@/components/chat/types";

const THREAD: ThreadIndexEntry = {
  id: "thr_a",
  title: "Alpha",
  createdAt: "2026-05-11T10:00:00Z",
  updatedAt: "2026-05-11T10:00:00Z",
  providerKind: "claude-code",
  messageCount: 0,
};

function activity(
  id: string,
  turnId: string | null,
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
    createdAt: "2026-05-11T10:00:00Z",
    ...overrides,
  };
}

function turn(turnId: string, overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    threadId: "thr_a",
    turnId,
    state: "running",
    requestedAt: "2026-05-11T10:00:00Z",
    completedAt: null,
    assistantMessageId: null,
    ...overrides,
  };
}

function checkpoint(
  turnId: string,
  overrides: Partial<CheckpointSummaryView> = {},
): CheckpointSummaryView {
  return {
    turnId,
    checkpointTurnCount: 1,
    checkpointRef: "deadbeef",
    status: "ready",
    files: [],
    assistantMessageId: null,
    completedAt: "2026-05-11T10:01:00Z",
    ...overrides,
  };
}

function plan(): ProposedPlanView {
  return {
    id: "plan_1",
    turnId: "t1",
    planMarkdown: "## A plan",
    implementedAt: null,
    implementationThreadId: null,
    createdAt: "2026-05-11T10:00:00Z",
    updatedAt: "2026-05-11T10:00:00Z",
  };
}

describe("ThreadView", () => {
  it("renders an empty state placeholder when no thread is selected", () => {
    render(
      <ThreadView
        thread={null}
        activities={[]}
        turns={{}}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("thread-view-empty")).toBeTruthy();
  });

  it("renders 'no activity yet' when the thread has no activities or turns", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[]}
        turns={{}}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("thread-view-stream-empty")).toBeTruthy();
  });

  it("renders a single turn block when one turn is present", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[activity("a1", "t1")]}
        turns={{ t1: turn("t1", { state: "completed" }) }}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getAllByTestId("turn-block")).toHaveLength(1);
  });

  it("renders multiple turn blocks in insertion order", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[activity("a1", "t1"), activity("a2", "t2"), activity("a3", "t1")]}
        turns={{
          t1: turn("t1", { state: "completed" }),
          t2: turn("t2", { state: "completed" }),
        }}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    const blocks = screen.getAllByTestId("turn-block");
    expect(blocks.map((b) => b.getAttribute("data-turn-id"))).toEqual(["t1", "t2"]);
  });

  it("marks a running turn with a streaming indicator", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[activity("a1", "t1")]}
        turns={{ t1: turn("t1", { state: "running" }) }}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("turn-streaming-indicator")).toBeTruthy();
  });

  it("renders a CheckpointChip when a checkpoint exists for the turn", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[activity("a1", "t1")]}
        turns={{ t1: turn("t1", { state: "completed" }) }}
        checkpointsByTurn={{ t1: checkpoint("t1") }}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("checkpoint-chip")).toBeTruthy();
  });

  it("renders a PlanCardStub for kind='propose-plan' activities", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[
          activity("a1", "t1", {
            kind: "propose-plan",
            payload: { planId: "plan_1" },
          }),
        ]}
        turns={{ t1: turn("t1", { state: "completed" }) }}
        checkpointsByTurn={{}}
        plansById={{ plan_1: plan() }}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-card-stub")).toBeTruthy();
  });

  it("renders distinct visual treatment for error and approval tones", () => {
    render(
      <ThreadView
        thread={THREAD}
        activities={[
          activity("a1", "t1", { tone: "error", summary: "boom" }),
          activity("a2", "t1", { tone: "approval", summary: "need approval" }),
        ]}
        turns={{ t1: turn("t1", { state: "completed" }) }}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("activity-row");
    const tones = rows.map((r) => r.getAttribute("data-tone"));
    expect(tones).toEqual(expect.arrayContaining(["error", "approval"]));
  });

  it("renders the token-usage chip when usage is provided", () => {
    render(
      <ThreadView
        thread={THREAD}
        usage={{ inputTokens: 100, outputTokens: 200, totalCostUsd: 0.05 }}
        activities={[]}
        turns={{}}
        checkpointsByTurn={{}}
        plansById={{}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("thread-view-usage").textContent).toContain("100");
    expect(screen.getByTestId("thread-view-usage").textContent).toContain("200");
  });
});
