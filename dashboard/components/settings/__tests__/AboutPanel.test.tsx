import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutPanel } from "../AboutPanel";

afterEach(() => {
  delete window.__TMUX_IDE__;
});

describe("AboutPanel", () => {
  it("shows the injected Electron version", () => {
    window.__TMUX_IDE__ = { port: 7070, version: "1.2.3" };
    render(<AboutPanel />);
    expect(screen.getByTestId("about-version").textContent).toContain("1.2.3");
  });

  it("checks for updates and renders status pushed over preload IPC", async () => {
    type TestUpdatePayload = { status: "update-available"; message?: string };
    type TestRuntime = NonNullable<typeof window.__TMUX_IDE__> & {
      checkForUpdates: () => Promise<void>;
      onUpdateStatus: (handler: (payload: TestUpdatePayload) => void) => () => void;
    };

    let statusHandler: ((payload: TestUpdatePayload) => void) | null = null;
    const checkForUpdates = vi.fn().mockResolvedValue(undefined);
    const dispose = vi.fn();

    window.__TMUX_IDE__ = {
      port: 7070,
      version: "1.2.3",
      checkForUpdates,
      onUpdateStatus: (handler) => {
        statusHandler = handler;
        return dispose;
      },
    } as TestRuntime;

    render(<AboutPanel />);
    fireEvent.click(screen.getByTestId("about-check-updates"));

    expect(checkForUpdates).toHaveBeenCalledOnce();
    expect(screen.getByTestId("about-update-status").textContent).toBe("Checking");

    await act(async () => {
      statusHandler?.({ status: "update-available", message: "Version 1.2.4" });
    });

    expect(screen.getByTestId("about-update-status").textContent).toBe("Update available");
    expect(screen.getByTestId("about-update-message").textContent).toBe("Version 1.2.4");
  });
});
