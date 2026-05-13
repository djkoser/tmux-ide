/**
 * Wire-coverage for SkillsViewBridge (T1).
 *
 * The widget exposes onCreate / onUpdate / onDelete to the host. The
 * bridge wires each to the daemon's skills CRUD endpoints (WN6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";
import { SkillsViewBridge } from "@/components/skills-view-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

interface SkillsCaptured {
  onCreate?: (v: {
    name: string;
    role?: string;
    description?: string;
    specialties?: ReadonlyArray<string>;
    body?: string;
  }) => Promise<void>;
  onUpdate?: (
    name: string,
    v: { body?: string; description?: string },
  ) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("SkillsViewBridge — wire", () => {
  it("onCreate POSTs /api/project/:name/skill with the form payload", async () => {
    const fetchMock = mockFetchOk({ json: { skill: { name: "rev" } } });
    render(<SkillsViewBridge projectName="proj" />);
    const opts = await waitForCapture<SkillsCaptured>("SkillsView");
    await opts.onCreate!({
      name: "rev",
      role: "validator",
      description: "Reviews PRs",
      specialties: ["lint"],
      body: "## Reviewer",
    });

    const createCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        typeof url === "string" &&
        url.endsWith("/api/project/proj/skill") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(createCall).toBeDefined();
    expect(JSON.parse(String((createCall![1] as RequestInit).body))).toEqual({
      name: "rev",
      role: "validator",
      description: "Reviews PRs",
      specialties: ["lint"],
      body: "## Reviewer",
    });
  });

  it("onUpdate PUTs /api/project/:name/skill/:name with edited fields", async () => {
    const fetchMock = mockFetchOk({ json: { skill: { name: "rev" } } });
    render(<SkillsViewBridge projectName="proj" />);
    const opts = await waitForCapture<SkillsCaptured>("SkillsView");
    await opts.onUpdate!("rev", { body: "## Updated", description: "x" });

    const putCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        typeof url === "string" &&
        url.endsWith("/api/project/proj/skill/rev") &&
        (init as RequestInit | undefined)?.method === "PUT"
      );
    });
    expect(putCall).toBeDefined();
  });

  it("onDelete DELETEs /api/project/:name/skill/:name", async () => {
    const fetchMock = mockFetchOk();
    render(<SkillsViewBridge projectName="proj" />);
    const opts = await waitForCapture<SkillsCaptured>("SkillsView");
    await opts.onDelete!("rev");

    const delCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        typeof url === "string" &&
        url.endsWith("/api/project/proj/skill/rev") &&
        (init as RequestInit | undefined)?.method === "DELETE"
      );
    });
    expect(delCall).toBeDefined();
  });
});
