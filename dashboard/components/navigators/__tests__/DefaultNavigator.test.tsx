import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../SessionsNavigator", () => ({
  SessionsNavigator: () => <div data-testid="sn-mock">sessions</div>,
}));
vi.mock("../SkillsNavigator", () => ({
  SkillsNavigator: () => <div data-testid="sk-mock">skills</div>,
}));
vi.mock("../MissionTreeNavigator", () => ({
  MissionTreeNavigator: ({ sessionName }: { sessionName: string }) => (
    <div data-testid="mt-mock">mission:{sessionName}</div>
  ),
}));

const pathnameRef = { current: "/" };
const activitySectionRef = { current: "sessions" as "sessions" | "skills" | "settings" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

vi.mock("@/lib/useLayoutState", () => ({
  useLayoutState: () => ({ activitySection: activitySectionRef.current }),
}));

import { DefaultNavigator } from "../DefaultNavigator";

afterEach(() => {
  pathnameRef.current = "/";
  activitySectionRef.current = "sessions";
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", "/");
  }
});

describe("DefaultNavigator", () => {
  it("falls back to SessionsNavigator on the overview route", () => {
    pathnameRef.current = "/";
    render(<DefaultNavigator />);
    expect(screen.getByTestId("sn-mock")).toBeTruthy();
  });

  it("renders SkillsNavigator when global mode is skills", () => {
    activitySectionRef.current = "skills";
    pathnameRef.current = "/project/alpha";
    render(<DefaultNavigator />);
    expect(screen.getByTestId("sk-mock")).toBeTruthy();
  });

  it("renders nothing when global mode is settings (SettingsView portals its own)", () => {
    activitySectionRef.current = "settings";
    const { container } = render(<DefaultNavigator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders MissionTreeNavigator on the kanban tab of a project route", () => {
    pathnameRef.current = "/project/alpha";
    activitySectionRef.current = "sessions";
    render(<DefaultNavigator />);
    expect(screen.getByTestId("mt-mock").textContent).toBe("mission:alpha");
  });

  it("falls back to SessionsNavigator on a project route with an unrelated tab", () => {
    pathnameRef.current = "/project/alpha";
    activitySectionRef.current = "sessions";
    window.history.replaceState(null, "", "/project/alpha?tab=plans");
    render(<DefaultNavigator />);
    expect(screen.getByTestId("sn-mock")).toBeTruthy();
  });
});
