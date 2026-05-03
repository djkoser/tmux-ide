import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill, type StatusPillVariant } from "../StatusPill";

const cases: Array<[StatusPillVariant, string]> = [
  ["passing", "var(--green)"],
  ["failing", "var(--red)"],
  ["pending", "var(--dim)"],
  ["blocked", "var(--yellow)"],
  ["active", "var(--accent)"],
  ["done", "var(--green)"],
  ["archived", "var(--dimmer)"],
  ["info", "var(--cyan)"],
  ["warning", "var(--yellow)"],
  ["error", "var(--red)"],
  ["success", "var(--green)"],
];

describe("StatusPill", () => {
  it.each(cases)("renders %s with expected color", (variant, color) => {
    render(<StatusPill variant={variant} label={variant} />);

    const pill = screen.getByTestId("status-pill");
    const dot = screen.getByTestId("status-pill-dot");

    expect(pill.dataset.variant).toBe(variant);
    expect(pill.style.color).toBe(color);
    expect(dot.style.background).toBe(color);
  });
});
