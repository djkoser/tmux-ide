/**
 * Wire-coverage for PlansPanelBridge (T1).
 *
 * The bridge forwards three callbacks to the widget: onEdit,
 * onMarkDone, onDelete. The host owns the actual daemon mutation —
 * the bridge's job is to pass the callback through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";
import { PlansPanelBridge } from "@/components/plans-panel-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

interface PlansCaptured {
  onEdit?: () => void;
  onMarkDone?: () => void;
  onDelete?: () => void;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

const stubPlanData = { body: "# Plan", marks: [], stats: null } as never;

describe("PlansPanelBridge — wire", () => {
  it("forwards onEdit to the host callback", async () => {
    mockFetchOk();
    const onEdit = vi.fn();
    render(
      <PlansPanelBridge
        plan={null}
        planData={stubPlanData}
        onEdit={onEdit}
      />,
    );
    const opts = await waitForCapture<PlansCaptured>("PlansPanel");
    opts.onEdit!();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("forwards onMarkDone to the host callback", async () => {
    mockFetchOk();
    const onMarkDone = vi.fn();
    render(
      <PlansPanelBridge
        plan={null}
        planData={stubPlanData}
        onMarkDone={onMarkDone}
      />,
    );
    const opts = await waitForCapture<PlansCaptured>("PlansPanel");
    opts.onMarkDone!();
    expect(onMarkDone).toHaveBeenCalledTimes(1);
  });

  it("forwards onDelete to the host callback", async () => {
    mockFetchOk();
    const onDelete = vi.fn();
    render(
      <PlansPanelBridge
        plan={null}
        planData={stubPlanData}
        onDelete={onDelete}
      />,
    );
    const opts = await waitForCapture<PlansCaptured>("PlansPanel");
    opts.onDelete!();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
