import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { V2ActivityBar, type ActivityBarViewId } from "@/app/v2/_lib/V2ActivityBar";

afterEach(() => cleanup());

describe("V2ActivityBar :: Terminal entry (T085 fix #2)", () => {
  it("renders a Terminal button next to Chat", () => {
    render(<V2ActivityBar view="kanban" onView={() => undefined} />);
    expect(screen.getByTestId("v2-activity-terminal")).toBeTruthy();
    expect(screen.getByTestId("v2-activity-chat")).toBeTruthy();
  });

  it("Terminal button calls onView('terminal')", () => {
    const onView = vi.fn();
    render(<V2ActivityBar view="kanban" onView={onView} />);
    screen.getByTestId("v2-activity-terminal").click();
    expect(onView).toHaveBeenCalledWith("terminal" as ActivityBarViewId);
  });

  it("Terminal button reports the active treatment when view==='terminal'", () => {
    render(<V2ActivityBar view="terminal" onView={() => undefined} />);
    const btn = screen.getByTestId("v2-activity-terminal");
    expect(btn.getAttribute("data-active")).toBe("true");
  });

  it("Terminal button is not active when view is something else", () => {
    render(<V2ActivityBar view="chat" onView={() => undefined} />);
    const btn = screen.getByTestId("v2-activity-terminal");
    expect(btn.getAttribute("data-active")).toBeNull();
  });

  it("ariaLabel exposes 'Terminal' for assistive tech", () => {
    render(<V2ActivityBar view="kanban" onView={() => undefined} />);
    expect(screen.getByLabelText("Terminal")).toBeTruthy();
  });
});
