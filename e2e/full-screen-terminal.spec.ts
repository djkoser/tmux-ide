import { expect, test, type Page } from "@playwright/test";

const PROJECTS = ["tmux-ide", "docs"];

function session(name: string) {
  return {
    name,
    dir: `/tmp/${name}`,
    mission: null,
    stats: { totalTasks: 0, doneTasks: 0, agents: 0, activeAgents: 0 },
  };
}

function project(name: string) {
  return {
    session: name,
    dir: `/tmp/${name}`,
    mission: null,
    goals: [],
    tasks: [],
    agents: [],
  };
}

async function mockApi(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/sessions") {
      await route.fulfill({ json: { sessions: PROJECTS.map(session) } });
      return;
    }

    const projectMatch = path.match(/^\/api\/project\/([^/]+)(?:\/(.*))?$/);
    if (projectMatch) {
      const [, encodedName, sub] = projectMatch;
      const name = decodeURIComponent(encodedName);
      if (!PROJECTS.includes(name)) {
        await route.fulfill({ status: 404, json: null });
        return;
      }
      if (!sub) {
        await route.fulfill({ json: project(name) });
        return;
      }
      if (sub === "mission") {
        await route.fulfill({ json: null });
        return;
      }
      await route.fulfill({ json: [] });
      return;
    }

    await route.continue();
  });
}

async function toggleTerminal(page: Page) {
  await page.keyboard.press("Control+Backquote");
}

async function openTerminalMode(page: Page, mode: "keybind" | "button" = "button") {
  if (mode === "button") {
    await page.getByTestId("terminal-toggle").click();
  } else {
    await toggleTerminal(page);
  }
  const frame = page.getByTestId("terminal-frame");
  await expect(frame).toHaveAttribute("data-state", "connected", { timeout: 30_000 });
  return frame;
}

test.describe("full-screen terminal mode", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("Mod+` toggles terminal mode", async ({ page }) => {
    await page.goto("/");

    await openTerminalMode(page, "keybind");
    await expect(page.getByTestId("full-screen-terminal")).toBeVisible();

    await toggleTerminal(page);
    await expect(page.getByTestId("full-screen-terminal")).toHaveCount(0);
    await expect(page.getByTestId("terminal-frame")).toHaveCount(0);
  });

  test("newTab adds a tab", async ({ page }) => {
    await page.goto("/");

    await openTerminalMode(page);
    await expect(page.getByTestId("terminal-tab")).toHaveCount(1);

    await page.getByTestId("terminal-new-tab").click();
    await expect(page.getByTestId("terminal-tab")).toHaveCount(2);
  });

  test("terminal mode survives sidebar nav", async ({ page }) => {
    await page.goto(`/project/${encodeURIComponent(PROJECTS[0])}`);
    const frame = await openTerminalMode(page);

    await frame.click();
    await page.keyboard.type("echo nav-survives");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("terminal-transcript")).toContainText("nav-survives");

    await page.getByTestId(`sidebar-session-${PROJECTS[1]}`).click();

    await expect(page).toHaveURL(new RegExp(`/project/${PROJECTS[1]}`));
    await expect(page.getByTestId("full-screen-terminal")).toBeVisible();
    await expect(page.getByTestId("terminal-frame")).toHaveAttribute("data-state", "connected");
    await expect(page.getByTestId("terminal-transcript")).toContainText("nav-survives");
  });
});
