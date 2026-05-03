import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "../KpiCard";

describe("KpiCard", () => {
  it("applies active state styling", () => {
    render(<KpiCard label="Passing" value={4} active />);

    const card = screen.getByTestId("kpi-card");

    expect(card.dataset.active).toBe("true");
    expect(card.className).toContain("border-[var(--accent)]");
    expect(card.className).toContain("bg-[var(--surface-active)]");
  });
});
