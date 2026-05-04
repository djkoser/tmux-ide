import { describe, expect, it } from "vitest";
import type { RegisteredProject } from "@/lib/api";
import {
  chunksToConsoleText,
  deriveInitTabSubmit,
  deriveNameFromDir,
  deriveOpenTabSubmit,
  initJobReducer,
  isInitDoneFrame,
  isInitErrorFrame,
  normalizeDir,
  parseInitOutputFrame,
  validateDir,
  validateName,
  type InitJobChunk,
  type InitJobState,
} from "../AddProjectDialog.logic";

const PROJECT: RegisteredProject = {
  name: "alpha",
  dir: "/repos/alpha",
  hasIdeYml: true,
  gitOrigin: null,
  gitBranch: null,
  registeredAt: "2026-05-01T00:00:00Z",
};

describe("normalizeDir", () => {
  it("trims whitespace", () => {
    expect(normalizeDir("  /repos/alpha  ")).toBe("/repos/alpha");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDir("")).toBe("");
    expect(normalizeDir("   ")).toBe("");
  });

  it("expands ~/sub when baseDir is provided", () => {
    expect(normalizeDir("~/proj", "/Users/me")).toBe("/Users/me/proj");
    expect(normalizeDir("~/", "/Users/me/")).toBe("/Users/me/");
  });

  it("expands bare ~ to baseDir", () => {
    expect(normalizeDir("~", "/Users/me")).toBe("/Users/me");
  });

  it("leaves absolute paths alone", () => {
    expect(normalizeDir("/repos/alpha", "/Users/me")).toBe("/repos/alpha");
  });
});

describe("validateDir", () => {
  it("rejects empty input", () => {
    expect(validateDir("")).toEqual({ valid: false, reason: expect.any(String) });
  });

  it("rejects relative paths", () => {
    expect(validateDir("relative/path").valid).toBe(false);
  });

  it("accepts absolute paths", () => {
    expect(validateDir("/repos/alpha").valid).toBe(true);
  });

  it("accepts ~/-prefixed paths", () => {
    expect(validateDir("~/projects/alpha").valid).toBe(true);
  });

  it("rejects paths with control characters", () => {
    expect(validateDir("/repos/\nalpha").valid).toBe(false);
  });
});

describe("validateName", () => {
  it("returns valid for null/undefined", () => {
    expect(validateName(null, []).valid).toBe(true);
    expect(validateName(undefined, []).valid).toBe(true);
  });

  it("returns valid for empty/whitespace", () => {
    expect(validateName("", []).valid).toBe(true);
    expect(validateName("   ", []).valid).toBe(true);
  });

  it("rejects names with disallowed characters", () => {
    expect(validateName("hello world", []).valid).toBe(false);
    expect(validateName("foo/bar", []).valid).toBe(false);
  });

  it("flags collisions with existing projects", () => {
    const result = validateName("alpha", [PROJECT]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("alpha");
  });

  it("accepts unique names with valid characters", () => {
    expect(validateName("foo-bar.baz_1", [PROJECT]).valid).toBe(true);
  });
});

describe("deriveNameFromDir", () => {
  it("returns the basename", () => {
    expect(deriveNameFromDir("/repos/alpha")).toBe("alpha");
    expect(deriveNameFromDir("/repos/alpha/")).toBe("alpha");
    expect(deriveNameFromDir("alpha")).toBe("alpha");
  });

  it("returns empty for empty input", () => {
    expect(deriveNameFromDir("")).toBe("");
  });
});

describe("initJobReducer", () => {
  it("transitions idle -> running on start", () => {
    const next = initJobReducer({ kind: "idle" }, { type: "start", jobId: "j1" });
    expect(next).toEqual({ kind: "running", jobId: "j1", chunks: [] });
  });

  it("appends chunks while running", () => {
    const start: InitJobState = { kind: "running", jobId: "j1", chunks: [] };
    const chunk: InitJobChunk = { at: 1, text: "hello", stream: "stdout" };
    const next = initJobReducer(start, { type: "chunk", jobId: "j1", chunk });
    expect(next.kind === "running" && next.chunks.length).toBe(1);
  });

  it("ignores chunks with mismatched jobId", () => {
    const start: InitJobState = { kind: "running", jobId: "j1", chunks: [] };
    const chunk: InitJobChunk = { at: 1, text: "x", stream: "stdout" };
    const next = initJobReducer(start, { type: "chunk", jobId: "j2", chunk });
    expect(next).toBe(start);
  });

  it("transitions running -> succeeded on success", () => {
    const start: InitJobState = { kind: "running", jobId: "j1", chunks: [] };
    const next = initJobReducer(start, {
      type: "succeeded",
      jobId: "j1",
      project: PROJECT,
    });
    expect(next.kind).toBe("succeeded");
  });

  it("transitions running -> failed on failure", () => {
    const start: InitJobState = { kind: "running", jobId: "j1", chunks: [] };
    const next = initJobReducer(start, {
      type: "failed",
      jobId: "j1",
      message: "boom",
    });
    expect(next.kind).toBe("failed");
    if (next.kind === "failed") expect(next.message).toBe("boom");
  });

  it("ignores stale succeed frames after the job is already done", () => {
    const succeeded: InitJobState = {
      kind: "succeeded",
      jobId: "j1",
      chunks: [],
      project: null,
    };
    const next = initJobReducer(succeeded, {
      type: "succeeded",
      jobId: "j1",
      project: PROJECT,
    });
    expect(next).toBe(succeeded);
  });

  it("reset returns to idle", () => {
    const succeeded: InitJobState = {
      kind: "succeeded",
      jobId: "j1",
      chunks: [],
      project: null,
    };
    expect(initJobReducer(succeeded, { type: "reset" }).kind).toBe("idle");
  });
});

describe("parseInitOutputFrame", () => {
  it("returns a chunk for valid frames matching the jobId", () => {
    const chunk = parseInitOutputFrame(
      { type: "init.output", jobId: "j1", chunk: "hello", stream: "stderr" },
      "j1",
    );
    expect(chunk).not.toBeNull();
    expect(chunk!.text).toBe("hello");
    expect(chunk!.stream).toBe("stderr");
  });

  it("returns null when jobId mismatches", () => {
    const chunk = parseInitOutputFrame(
      { type: "init.output", jobId: "j2", chunk: "hello" },
      "j1",
    );
    expect(chunk).toBeNull();
  });

  it("defaults stream to stdout when missing", () => {
    const chunk = parseInitOutputFrame(
      { type: "init.output", jobId: "j1", chunk: "hi" },
      "j1",
    );
    expect(chunk!.stream).toBe("stdout");
  });

  it("returns null for malformed frames", () => {
    expect(parseInitOutputFrame(null, "j1")).toBeNull();
    expect(parseInitOutputFrame({}, "j1")).toBeNull();
    expect(parseInitOutputFrame({ jobId: "j1" }, "j1")).toBeNull();
  });
});

describe("isInitDoneFrame", () => {
  it("returns true for the matching done frame", () => {
    expect(
      isInitDoneFrame({ type: "init.output", jobId: "j1", done: true }, "j1"),
    ).toBe(true);
  });

  it("returns false when done is false or missing", () => {
    expect(isInitDoneFrame({ type: "init.output", jobId: "j1" }, "j1")).toBe(false);
    expect(
      isInitDoneFrame({ type: "init.output", jobId: "j1", done: false }, "j1"),
    ).toBe(false);
  });
});

describe("isInitErrorFrame", () => {
  it("extracts the message", () => {
    const err = isInitErrorFrame(
      { type: "init.error", jobId: "j1", message: "bad config" },
      "j1",
    );
    expect(err).toEqual({ message: "bad config" });
  });

  it("returns null for unrelated frames", () => {
    expect(isInitErrorFrame({ type: "task.changed" }, "j1")).toBeNull();
  });
});

describe("chunksToConsoleText", () => {
  it("concatenates chunk text in order", () => {
    expect(
      chunksToConsoleText([
        { at: 1, text: "a", stream: "stdout" },
        { at: 2, text: "b", stream: "stdout" },
      ]),
    ).toBe("ab");
  });
});

describe("deriveOpenTabSubmit", () => {
  it("disables submit for invalid dir", () => {
    const state = deriveOpenTabSubmit({
      dir: "",
      probed: null,
      probing: false,
      existing: [],
    });
    expect(state.canSubmit).toBe(false);
  });

  it("disables while probing", () => {
    const state = deriveOpenTabSubmit({
      dir: "/repos/alpha",
      probed: null,
      probing: true,
      existing: [],
    });
    expect(state.canSubmit).toBe(false);
    expect(state.reason).toMatch(/Probing/);
  });

  it("disables when no ide.yml", () => {
    const state = deriveOpenTabSubmit({
      dir: "/repos/alpha",
      probed: { ...PROJECT, hasIdeYml: false },
      probing: false,
      existing: [],
    });
    expect(state.canSubmit).toBe(false);
    expect(state.reason).toMatch(/Initialize/);
  });

  it("disables when project name already registered", () => {
    const state = deriveOpenTabSubmit({
      dir: "/repos/alpha",
      probed: PROJECT,
      probing: false,
      existing: [PROJECT],
    });
    expect(state.canSubmit).toBe(false);
  });

  it("enables when probed + has ide.yml + unique name", () => {
    const state = deriveOpenTabSubmit({
      dir: "/repos/alpha",
      probed: PROJECT,
      probing: false,
      existing: [],
    });
    expect(state.canSubmit).toBe(true);
  });
});

describe("deriveInitTabSubmit", () => {
  it("disables while running", () => {
    const state = deriveInitTabSubmit({
      dir: "/repos/alpha",
      template: null,
      job: { kind: "running", jobId: "j1", chunks: [] },
    });
    expect(state.canSubmit).toBe(false);
  });

  it("disables for invalid dir", () => {
    const state = deriveInitTabSubmit({
      dir: "",
      template: null,
      job: { kind: "idle" },
    });
    expect(state.canSubmit).toBe(false);
  });

  it("enables when dir is valid and job is idle", () => {
    const state = deriveInitTabSubmit({
      dir: "/repos/alpha",
      template: "nextjs",
      job: { kind: "idle" },
    });
    expect(state.canSubmit).toBe(true);
  });
});
