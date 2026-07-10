import { describe, it, expect } from "bun:test";
import { isReviewerRole, canMarkDone, canReopen } from "./review-flow.ts";
import { makeTask } from "../__tests__/support.ts";

describe("isReviewerRole", () => {
  it("accepts both validator and reviewer (alias-tolerant during the rename)", () => {
    expect(isReviewerRole("validator")).toBe(true);
    expect(isReviewerRole("reviewer")).toBe(true);
  });

  it("rejects other roles and null", () => {
    expect(isReviewerRole("teammate")).toBe(false);
    expect(isReviewerRole("lead")).toBe(false);
    expect(isReviewerRole(null)).toBe(false);
    expect(isReviewerRole(undefined)).toBe(false);
  });
});

describe("canMarkDone", () => {
  const reviewTask = makeTask({ id: "001", status: "review", assignee: "cw3" });

  it("rejects a writer (assignee/teammate) marking their own task done", () => {
    const r = canMarkDone(reviewTask, { name: "cw3", role: "teammate" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Only the validator/reviewer");
  });

  it("accepts a validator marking a reviewed task done", () => {
    expect(canMarkDone(reviewTask, { name: "validator", role: "validator" }).ok).toBe(true);
  });

  it("accepts a reviewer (renamed role) marking a reviewed task done", () => {
    expect(canMarkDone(reviewTask, { name: "reviewer", role: "reviewer" }).ok).toBe(true);
  });

  it("rejects skipping review (done from in-progress) even for a validator", () => {
    const inProgress = makeTask({ id: "002", status: "in-progress" });
    const r = canMarkDone(inProgress, { name: "validator", role: "validator" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("must be in 'review'");
  });

  it("lets an override bypass both the review and role gates", () => {
    const inProgress = makeTask({ id: "003", status: "in-progress" });
    expect(canMarkDone(inProgress, { name: "op", role: null }, true).ok).toBe(true);
  });
});

describe("canReopen", () => {
  it("allows validator/reviewer and lead", () => {
    expect(canReopen({ name: "v", role: "validator" }).ok).toBe(true);
    expect(canReopen({ name: "r", role: "reviewer" }).ok).toBe(true);
    expect(canReopen({ name: "l", role: "lead" }).ok).toBe(true);
  });

  it("rejects a writer reopening a task", () => {
    expect(canReopen({ name: "cw3", role: "teammate" }).ok).toBe(false);
  });

  it("lets an override bypass the role gate", () => {
    expect(canReopen({ name: "op", role: null }, true).ok).toBe(true);
  });
});
