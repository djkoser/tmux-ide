import { describe, expect, it } from "vitest";
import type { ProjectInspect } from "@/lib/api";
import {
  buildOnboardInput,
  defaultStateFromInspect,
  fieldError,
  validateOnboarding,
  type OnboardingState,
} from "../OnboardingWizard.logic";

const INSPECT_NEXT: ProjectInspect = {
  name: "wavyr-website",
  dir: "/Users/me/code/wavyr-website",
  hasIdeYml: false,
  gitOrigin: null,
  gitBranch: null,
  detected: {
    packageManager: "pnpm",
    frameworks: ["next"],
    devCommand: "pnpm dev",
    testCommand: "pnpm test",
  },
};

const INSPECT_BARE: ProjectInspect = {
  name: "scratch",
  dir: "/Users/me/scratch",
  hasIdeYml: false,
  gitOrigin: null,
  gitBranch: null,
  detected: {
    packageManager: null,
    frameworks: [],
    devCommand: null,
    testCommand: null,
  },
};

describe("defaultStateFromInspect", () => {
  it("seeds from detected stack with dev pane enabled", () => {
    const state = defaultStateFromInspect(INSPECT_NEXT);
    expect(state.name).toBe("wavyr-website");
    expect(state.agents).toBe(2);
    expect(state.devEnabled).toBe(true);
    expect(state.devCommand).toBe("pnpm dev");
    expect(state.testCommand).toBe("pnpm test");
  });

  it("disables the dev pane by default when nothing was detected", () => {
    const state = defaultStateFromInspect(INSPECT_BARE);
    expect(state.devEnabled).toBe(false);
    expect(state.devCommand).toBe("");
    expect(state.testCommand).toBe("");
  });
});

describe("validateOnboarding", () => {
  function base(): OnboardingState {
    return defaultStateFromInspect(INSPECT_NEXT);
  }

  it("accepts a sane default state", () => {
    expect(validateOnboarding(base()).valid).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = validateOnboarding({ ...base(), name: "" });
    expect(result.valid).toBe(false);
    expect(fieldError(result, "name")).toMatch(/pick a project name/i);
  });

  it("rejects a name with spaces", () => {
    const result = validateOnboarding({ ...base(), name: "bad name" });
    expect(result.valid).toBe(false);
    expect(fieldError(result, "name")).toMatch(/letters/i);
  });

  it("rejects a missing dev command when the dev pane is enabled", () => {
    const result = validateOnboarding({
      ...base(),
      devEnabled: true,
      devCommand: "  ",
    });
    expect(result.valid).toBe(false);
    expect(fieldError(result, "devCommand")).toMatch(/enter a dev/i);
  });

  it("does not require a dev command when the pane is disabled", () => {
    const result = validateOnboarding({
      ...base(),
      devEnabled: false,
      devCommand: "",
    });
    expect(result.valid).toBe(true);
  });
});

describe("buildOnboardInput", () => {
  it("omits name when it matches inspect.name", () => {
    const state = defaultStateFromInspect(INSPECT_NEXT);
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.dir).toBe(INSPECT_NEXT.dir);
    expect(input.agents).toBe(2);
    expect(input.devCommand).toBe("pnpm dev");
    expect(input.testCommand).toBe("pnpm test");
    expect(input.name).toBeUndefined();
  });

  it("includes name when overridden", () => {
    const state = { ...defaultStateFromInspect(INSPECT_NEXT), name: "renamed" };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.name).toBe("renamed");
  });

  it("nulls devCommand when the pane is disabled", () => {
    const state = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      devEnabled: false,
    };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.devCommand).toBeNull();
  });

  it("nulls devCommand when the pane is enabled but empty", () => {
    const state = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      devEnabled: true,
      devCommand: "  ",
    };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.devCommand).toBeNull();
  });

  it("omits testCommand when blank", () => {
    const state = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      testCommand: "",
    };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.testCommand).toBeUndefined();
  });
});
