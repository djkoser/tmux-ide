import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroStrip } from "../HeroStrip";

describe("HeroStrip", () => {
  it("renders mission title and status", () => {
    render(
      <HeroStrip
        title="Ship v2"
        description=""
        status="active"
        branch="main"
        created={null}
        updated={null}
      />,
    );
    expect(screen.getByTestId("mission-hero")).toBeTruthy();
    expect(screen.getByTestId("mission-title")).toBeTruthy();
    expect(screen.getByText("Ship v2")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
  });

  it("enters edit mode when clicking the title and saves on Enter", async () => {
    const onSave = vi.fn();
    render(
      <HeroStrip title="Old" description="" status="planning" branch={null} onTitleSave={onSave} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-title"));
    });
    const input = screen.getByTestId("mission-title-input") as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("New Title");
    });
  });

  it("does not save when title is unchanged", async () => {
    const onSave = vi.fn();
    render(
      <HeroStrip
        title="Same"
        description=""
        status="planning"
        branch={null}
        onTitleSave={onSave}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-title"));
    });
    const input = screen.getByTestId("mission-title-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
