import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";

import WidgetsGalleryPage from "@/app/v2/widgets/page";

afterEach(() => cleanup());

describe("WidgetsGalleryPage", () => {
  it("renders all 24 widget tiles by default (8 TUI + 16 Solid)", () => {
    render(<WidgetsGalleryPage />);
    const tiles = screen.getAllByTestId("widget-tile");
    expect(tiles).toHaveLength(24);
    const tui = tiles.filter((t) => t.getAttribute("data-widget-kind") === "tui");
    const solid = tiles.filter((t) => t.getAttribute("data-widget-kind") === "solid");
    expect(tui).toHaveLength(8);
    expect(solid).toHaveLength(16);
  });

  it("filters to 8 tiles when the 'Daemon TUI' chip is active", () => {
    render(<WidgetsGalleryPage />);
    fireEvent.click(screen.getByTestId("widgets-gallery-chip-tui"));
    const tiles = screen.getAllByTestId("widget-tile");
    expect(tiles).toHaveLength(8);
    expect(
      tiles.every((t) => t.getAttribute("data-widget-kind") === "tui"),
    ).toBe(true);
  });

  it("filters to 16 tiles when the 'Solid DOM' chip is active", () => {
    render(<WidgetsGalleryPage />);
    fireEvent.click(screen.getByTestId("widgets-gallery-chip-solid"));
    const tiles = screen.getAllByTestId("widget-tile");
    expect(tiles).toHaveLength(16);
    expect(
      tiles.every((t) => t.getAttribute("data-widget-kind") === "solid"),
    ).toBe(true);
  });

  it("filters to only composite widgets via the 'Composite' chip", () => {
    render(<WidgetsGalleryPage />);
    fireEvent.click(screen.getByTestId("widgets-gallery-chip-composite"));
    const tiles = screen.getAllByTestId("widget-tile");
    // mission-control (TUI) + MissionControl + MissionControlDashboard +
    // ExplorerDashboard + CostsDashboard = 5
    expect(tiles.length).toBeGreaterThan(0);
    expect(
      tiles.every((t) => t.getAttribute("data-widget-composite") === "true"),
    ).toBe(true);
  });

  it("search input filters tiles by name (substring, case-insensitive)", () => {
    render(<WidgetsGalleryPage />);
    fireEvent.change(screen.getByTestId("widgets-gallery-search"), {
      target: { value: "task" },
    });
    const tiles = screen.getAllByTestId("widget-tile");
    const names = tiles.map((t) =>
      t.querySelector('[data-testid="widget-tile-name"]')?.textContent ?? "",
    );
    // tasks (TUI) + TasksView + KanbanBoard (description mentions tasks)
    expect(names).toContain("tasks");
    expect(names).toContain("TasksView");
    expect(names.length).toBeGreaterThan(0);
  });

  it("search returns the empty state when nothing matches", () => {
    render(<WidgetsGalleryPage />);
    fireEvent.change(screen.getByTestId("widgets-gallery-search"), {
      target: { value: "zzzz-nonexistent" },
    });
    expect(screen.queryAllByTestId("widget-tile")).toHaveLength(0);
    expect(screen.getByTestId("widgets-gallery-empty")).toBeTruthy();
  });

  it("count badge in header reflects filtered tile count", () => {
    render(<WidgetsGalleryPage />);
    const header = screen.getByTestId("widgets-gallery-header");
    expect(header.textContent).toContain("(24/24)");
    fireEvent.click(screen.getByTestId("widgets-gallery-chip-tui"));
    expect(screen.getByTestId("widgets-gallery-header").textContent).toContain("(8/24)");
  });

  it("tile links to the per-widget /v2/widget/<name> route for TUI tiles", () => {
    render(<WidgetsGalleryPage />);
    const tui = screen
      .getAllByTestId("widget-tile")
      .filter((t) => t.getAttribute("data-widget-kind") === "tui");
    expect(tui.length).toBeGreaterThan(0);
    for (const tile of tui) {
      const href = tile.getAttribute("href");
      expect(href).toMatch(/^\/v2\/widget\//);
    }
  });

  it("orphan-status widgets render an 'orphan' badge", () => {
    render(<WidgetsGalleryPage />);
    const orphans = screen.getAllByTestId("widget-tile-status-orphan");
    // CostsDashboard, ExplorerDashboard, MissionControlDashboard per the
    // catalog — 3 entries.
    expect(orphans.length).toBe(3);
  });
});
