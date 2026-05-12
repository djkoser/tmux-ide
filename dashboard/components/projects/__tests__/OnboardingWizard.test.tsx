import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectInspect, RegisteredProject } from "@/lib/api";
import { OnboardingWizard } from "../OnboardingWizard";

const INSPECT: ProjectInspect = {
  name: "wavyr-website",
  dir: "/Users/me/code/wavyr-website",
  hasIdeYml: false,
  gitOrigin: null,
  gitBranch: null,
  detected: {
    packageManager: "pnpm",
    frameworks: ["next", "react"],
    devCommand: "pnpm dev",
    testCommand: "pnpm test",
  },
};

const INSPECT_NO_DEV: ProjectInspect = {
  ...INSPECT,
  detected: {
    ...INSPECT.detected,
    devCommand: null,
  },
};

function advanceTo(step: "agents" | "tools" | "review") {
  fireEvent.click(screen.getByTestId("onboarding-next"));
  if (step === "agents") return;
  fireEvent.click(screen.getByTestId("onboarding-next"));
  if (step === "tools") return;
  fireEvent.click(screen.getByTestId("onboarding-next"));
}

describe("OnboardingWizard — step rail + navigation", () => {
  it("renders the four step labels", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("onboarding-step-rail")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-basics")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-agents")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-tools")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-review")).toBeTruthy();
  });

  it("starts on Basics with name pre-filled", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("onboarding-step-basics").getAttribute("data-active")).toBe("true");
    expect((screen.getByTestId("onboarding-name") as HTMLInputElement).value).toBe("wavyr-website");
    expect(screen.getByTestId("onboarding-dir").textContent).toContain(INSPECT.dir);
    expect(screen.getByTestId("onboarding-stack").textContent).toMatch(/next/);
  });

  it("Next button disabled when current step invalid (empty name)", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByTestId("onboarding-name"), { target: { value: "" } });
    expect((screen.getByTestId("onboarding-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("steps forward Basics → Agents → Tools → Review with Next", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-step-agents").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("onboarding-agent-name-0")).toBeTruthy();

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-step-tools").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("onboarding-dev-toggle")).toBeTruthy();

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-step-review").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("onboarding-preview")).toBeTruthy();
  });

  it("Back button takes the user to the previous step", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    advanceTo("tools");
    expect(screen.getByTestId("onboarding-step-tools").getAttribute("data-active")).toBe("true");
    fireEvent.click(screen.getByTestId("onboarding-back"));
    expect(screen.getByTestId("onboarding-step-agents").getAttribute("data-active")).toBe("true");
  });

  it("rail click jumps to a reachable step", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-step-tools"));
    expect(screen.getByTestId("onboarding-step-tools").getAttribute("data-active")).toBe("true");
  });

  it("rail click does not jump past an invalid step", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByTestId("onboarding-name"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("onboarding-step-review"));
    expect(screen.getByTestId("onboarding-step-basics").getAttribute("data-active")).toBe("true");
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<OnboardingWizard inspect={INSPECT} onCancel={onCancel} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingWizard — Agents step", () => {
  it("toggles agent count and resizes the agent name list", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next"));

    expect(screen.getByTestId("onboarding-agent-name-0")).toBeTruthy();
    expect(screen.getByTestId("onboarding-agent-name-1")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-agent-name-2")).toBeNull();

    fireEvent.click(screen.getByTestId("onboarding-agents-3"));
    expect(screen.getByTestId("onboarding-agent-name-2")).toBeTruthy();
  });

  it("blocks Next when an agent name is empty", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.change(screen.getByTestId("onboarding-agent-name-0"), { target: { value: "" } });
    expect((screen.getByTestId("onboarding-next") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("OnboardingWizard — Tools step", () => {
  it("hides the dev command field when toggle is off", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    advanceTo("tools");
    fireEvent.click(screen.getByTestId("onboarding-dev-toggle"));
    expect(screen.queryByTestId("onboarding-dev-cmd")).toBeNull();
  });

  it("starts dev pane disabled when no command was detected", () => {
    render(<OnboardingWizard inspect={INSPECT_NO_DEV} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    advanceTo("tools");
    expect((screen.getByTestId("onboarding-dev-toggle") as HTMLInputElement).checked).toBe(false);
  });

  it("renders test and lint command inputs", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    advanceTo("tools");
    expect(screen.getByTestId("onboarding-test-cmd")).toBeTruthy();
    expect(screen.getByTestId("onboarding-lint-cmd")).toBeTruthy();
  });
});

describe("OnboardingWizard — Review step", () => {
  it("renders a YAML preview reflecting the current state", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    advanceTo("review");
    const preview = screen.getByTestId("onboarding-preview");
    expect(preview.textContent).toContain("name: wavyr-website");
    expect(preview.textContent).toContain("Lead");
    expect(preview.textContent).toContain("pnpm dev");
  });

  it("Create button submits the composed payload", () => {
    const onSubmit = vi.fn();
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={onSubmit} />);
    advanceTo("review");
    fireEvent.click(screen.getByTestId("onboarding-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      dir: INSPECT.dir,
      agents: 2,
      devCommand: "pnpm dev",
    });
  });

  it("Create button submits agentNames when the user renamed an agent", () => {
    const onSubmit = vi.fn();
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={onSubmit} />);
    // Basics → Agents
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.change(screen.getByTestId("onboarding-agent-name-1"), {
      target: { value: "Frontend" },
    });
    // Agents → Tools → Review
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-submit"));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      agentNames: ["Lead", "Frontend"],
    });
  });
});

describe("OnboardingWizard — uniqueness validation", () => {
  it("rejects a name that conflicts with an existing project", () => {
    const existing: RegisteredProject[] = [
      {
        name: "duplicate",
        dir: "/elsewhere",
        hasIdeYml: true,
        gitOrigin: null,
        gitBranch: null,
        registeredAt: "",
      },
    ];
    render(
      <OnboardingWizard
        inspect={INSPECT}
        existingProjects={existing}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("onboarding-name"), { target: { value: "duplicate" } });
    expect((screen.getByTestId("onboarding-next") as HTMLButtonElement).disabled).toBe(true);
  });
});
