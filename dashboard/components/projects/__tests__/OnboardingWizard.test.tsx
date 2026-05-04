import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectInspect } from "@/lib/api";
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

describe("OnboardingWizard", () => {
  it("renders the prefilled defaults from inspect", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("onboarding-wizard")).toBeTruthy();
    expect((screen.getByTestId("onboarding-name") as HTMLInputElement).value).toBe("wavyr-website");
    // Default agents = 2
    expect(screen.getByTestId("onboarding-agents-2").getAttribute("data-active")).toBe("true");
    // Dev pane enabled because we detected a dev command.
    expect((screen.getByTestId("onboarding-dev-toggle") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("onboarding-dev-cmd") as HTMLInputElement).value).toBe("pnpm dev");
  });

  it("toggles agent count buttons", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-agents-3"));
    expect(screen.getByTestId("onboarding-agents-3").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("onboarding-agents-2").getAttribute("data-active")).toBe("false");
  });

  it("hides the dev command field when the toggle is unchecked", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-dev-toggle"));
    expect(screen.queryByTestId("onboarding-dev-cmd")).toBeNull();
  });

  it("starts with the dev pane disabled when no devCommand was detected", () => {
    render(<OnboardingWizard inspect={INSPECT_NO_DEV} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect((screen.getByTestId("onboarding-dev-toggle") as HTMLInputElement).checked).toBe(false);
  });

  it("submits the composed payload", () => {
    const onSubmit = vi.fn();
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("onboarding-agents-3"));
    fireEvent.click(screen.getByTestId("onboarding-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      dir: INSPECT.dir,
      agents: 3,
      devCommand: "pnpm dev",
    });
  });

  it("disables submit when the name is invalid", () => {
    render(<OnboardingWizard inspect={INSPECT} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByTestId("onboarding-name"), {
      target: { value: "" },
    });
    expect((screen.getByTestId("onboarding-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<OnboardingWizard inspect={INSPECT} onCancel={onCancel} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
