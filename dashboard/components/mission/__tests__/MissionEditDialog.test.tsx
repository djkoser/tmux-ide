import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MissionEditDialog } from "../MissionEditDialog";

describe("MissionEditDialog", () => {
  it("renders fields with initial values when open", () => {
    render(
      <MissionEditDialog
        open
        onOpenChange={() => {}}
        initialTitle="Ship v2"
        initialDescription="Description"
        initialBranch="main"
        onSubmit={() => {}}
      />,
    );
    const title = screen.getByTestId("mission-edit-title") as HTMLInputElement;
    const description = screen.getByTestId("mission-edit-description") as HTMLTextAreaElement;
    const branch = screen.getByTestId("mission-edit-branch") as HTMLInputElement;
    expect(title.value).toBe("Ship v2");
    expect(description.value).toBe("Description");
    expect(branch.value).toBe("main");
  });

  it("submits the form and closes on save", async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MissionEditDialog
        open
        onOpenChange={onOpenChange}
        initialTitle="Old"
        initialDescription="Old desc"
        initialBranch={null}
        onSubmit={onSubmit}
      />,
    );
    const title = screen.getByTestId("mission-edit-title") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(title, { target: { value: "New" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-edit-save"));
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      title: "New",
      description: "Old desc",
      branch: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
