import { describe, expect, it } from "vitest";
import type { ProjectInspect } from "@/lib/api";
import {
  buildOnboardInput,
  defaultStateFromInspect,
  fieldError,
  isStepReachable,
  nextStep,
  prevStep,
  previewIdeYml,
  setAgentName,
  setAgents,
  setStep,
  validateAll,
  validateStep,
  ONBOARD_STEPS,
  type OnboardState,
  type OnboardStep,
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
  it("seeds from detected stack with dev pane enabled and starts on basics", () => {
    const state = defaultStateFromInspect(INSPECT_NEXT);
    expect(state.step).toBe<OnboardStep>("basics");
    expect(state.name).toBe("wavyr-website");
    expect(state.agents).toBe(2);
    expect(state.agentNames).toEqual(["Lead", "Teammate 1"]);
    expect(state.devEnabled).toBe(true);
    expect(state.devCommand).toBe("pnpm dev");
    expect(state.testCommand).toBe("pnpm test");
    expect(state.lintCommand).toBe("");
  });

  it("disables the dev pane by default when nothing was detected", () => {
    const state = defaultStateFromInspect(INSPECT_BARE);
    expect(state.devEnabled).toBe(false);
    expect(state.devCommand).toBe("");
    expect(state.testCommand).toBe("");
  });
});

describe("step transitions", () => {
  it("setStep moves to the requested step", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    expect(setStep(a, "agents").step).toBe("agents");
  });

  it("nextStep walks Basics → Agents → Tools → Review → null", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    expect(nextStep(a)).toBe("agents");
    expect(nextStep(setStep(a, "agents"))).toBe("tools");
    expect(nextStep(setStep(a, "tools"))).toBe("review");
    expect(nextStep(setStep(a, "review"))).toBeNull();
  });

  it("prevStep walks back, returns null on first step", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    expect(prevStep(a)).toBeNull();
    expect(prevStep(setStep(a, "agents"))).toBe("basics");
    expect(prevStep(setStep(a, "review"))).toBe("tools");
  });
});

describe("setAgents", () => {
  it("resizes agentNames preserving teammate-aware semantics", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT); // 2 agents, ["Lead","Teammate 1"]
    const renamed = setAgentName(a, 1, "Frontend");
    const grown = setAgents(renamed, 3);
    expect(grown.agentNames).toEqual(["Lead", "Frontend", "Teammate 2"]);
    const shrunk = setAgents(grown, 2);
    expect(shrunk.agentNames).toEqual(["Lead", "Frontend"]);
  });

  it("resets when going from team to solo (semantics change)", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    const solo = setAgents(setAgentName(a, 0, "MyLead"), 1);
    expect(solo.agentNames).toEqual(["Claude"]);
  });

  it("is a no-op when count matches", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    expect(setAgents(a, 2)).toBe(a);
  });
});

describe("validateStep", () => {
  function base(): OnboardState {
    return defaultStateFromInspect(INSPECT_NEXT);
  }

  it("Basics: rejects empty name", () => {
    const result = validateStep({ ...base(), name: "" }, "basics");
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/pick a project name/i);
  });

  it("Basics: rejects spaces", () => {
    const result = validateStep({ ...base(), name: "bad name" }, "basics");
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/letters/i);
  });

  it("Basics: rejects names already in the registry (uniqueness)", () => {
    const result = validateStep(
      { ...base(), name: "alpha" },
      "basics",
      { existingNames: ["alpha", "beta"] },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/already registered/i);
  });

  it("Basics: allowName lets the user keep the inspect.name", () => {
    const result = validateStep(
      { ...base(), name: "wavyr-website" },
      "basics",
      { existingNames: ["wavyr-website"], allowName: "wavyr-website" },
    );
    expect(result.valid).toBe(true);
  });

  it("Agents: rejects empty agent names", () => {
    const state = { ...base(), agentNames: ["Lead", ""] };
    const result = validateStep(state, "agents");
    expect(result.valid).toBe(false);
    expect(result.errors.agentName_1).toMatch(/each agent/i);
  });

  it("Agents: passes with non-empty names", () => {
    const result = validateStep(base(), "agents");
    expect(result.valid).toBe(true);
  });

  it("Tools: rejects missing dev command when toggle is on", () => {
    const result = validateStep(
      { ...base(), devEnabled: true, devCommand: "  " },
      "tools",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.devCommand).toMatch(/enter a dev/i);
  });

  it("Tools: dev command not required when toggle is off", () => {
    const result = validateStep(
      { ...base(), devEnabled: false, devCommand: "" },
      "tools",
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateAll", () => {
  it("aggregates all step errors", () => {
    const state: OnboardState = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      name: "",
      agentNames: ["", "Teammate 1"],
      devEnabled: true,
      devCommand: "",
    };
    const result = validateAll(state);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.agentName_0).toBeTruthy();
    expect(result.errors.devCommand).toBeTruthy();
  });

  it("passes for the seeded default", () => {
    expect(validateAll(defaultStateFromInspect(INSPECT_NEXT)).valid).toBe(true);
  });
});

describe("isStepReachable", () => {
  const base = defaultStateFromInspect(INSPECT_NEXT);

  it("current and earlier steps are always reachable", () => {
    const onTools = setStep(base, "tools");
    expect(isStepReachable(onTools, "basics")).toBe(true);
    expect(isStepReachable(onTools, "tools")).toBe(true);
  });

  it("forward steps reachable when prior steps validate", () => {
    expect(isStepReachable(base, "review")).toBe(true);
  });

  it("forward steps NOT reachable when an earlier step is invalid", () => {
    const broken = { ...base, name: "" };
    expect(isStepReachable(broken, "review")).toBe(false);
    expect(isStepReachable(broken, "agents")).toBe(false);
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
    // Default agent names → no agentNames in payload.
    expect(input.agentNames).toBeUndefined();
  });

  it("includes agentNames when the user customizes a slot", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    const renamed = setAgentName(a, 1, "Frontend");
    const input = buildOnboardInput(renamed, INSPECT_NEXT);
    expect(input.agentNames).toEqual(["Lead", "Frontend"]);
  });

  it("includes name when overridden", () => {
    const state = { ...defaultStateFromInspect(INSPECT_NEXT), name: "renamed" };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.name).toBe("renamed");
  });

  it("nulls devCommand when the pane is disabled", () => {
    const state = { ...defaultStateFromInspect(INSPECT_NEXT), devEnabled: false };
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

  it("omits testCommand and lintCommand when blank", () => {
    const state = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      testCommand: "",
      lintCommand: "",
    };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.testCommand).toBeUndefined();
    expect(input.lintCommand).toBeUndefined();
  });

  it("includes lintCommand when set", () => {
    const state = {
      ...defaultStateFromInspect(INSPECT_NEXT),
      lintCommand: "pnpm lint",
    };
    const input = buildOnboardInput(state, INSPECT_NEXT);
    expect(input.lintCommand).toBe("pnpm lint");
  });
});

describe("previewIdeYml", () => {
  it("emits a 1-agent solo config without team block", () => {
    const state = setAgents(defaultStateFromInspect(INSPECT_NEXT), 1);
    const yaml = previewIdeYml(state);
    expect(yaml).toContain("name: wavyr-website");
    expect(yaml).not.toContain("team:");
    expect(yaml).toContain("title: Claude");
    expect(yaml).toContain("focus: true");
  });

  it("emits a 2-agent team config with custom agent names", () => {
    const a = defaultStateFromInspect(INSPECT_NEXT);
    const renamed = setAgentName(a, 1, "Frontend");
    const yaml = previewIdeYml(renamed);
    expect(yaml).toContain("team:");
    expect(yaml).toContain("title: Lead");
    expect(yaml).toContain("title: Frontend");
    expect(yaml).toContain("role: lead");
    expect(yaml).toContain("role: teammate");
  });

  it("includes Dev pane when devEnabled and command is set", () => {
    const yaml = previewIdeYml(defaultStateFromInspect(INSPECT_NEXT));
    expect(yaml).toContain("title: Dev");
    expect(yaml).toContain('command: "pnpm dev"');
    expect(yaml).toContain("title: Shell");
  });

  it("omits Dev pane when toggle is off", () => {
    const state = { ...defaultStateFromInspect(INSPECT_NEXT), devEnabled: false };
    const yaml = previewIdeYml(state);
    expect(yaml).not.toContain("title: Dev\n");
    expect(yaml).toContain("title: Shell");
  });
});

describe("fieldError", () => {
  it("returns the error string for the field, or null", () => {
    const result = { valid: false, errors: { name: "bad" } };
    expect(fieldError(result, "name")).toBe("bad");
    expect(fieldError(result, "missing")).toBeNull();
  });
});

describe("ONBOARD_STEPS", () => {
  it("has the four expected steps in order", () => {
    expect(ONBOARD_STEPS).toEqual(["basics", "agents", "tools", "review"]);
  });
});
