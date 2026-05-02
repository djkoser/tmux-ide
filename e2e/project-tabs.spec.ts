import { expect, test } from "@playwright/test";

const PROJECT = "tmux-ide";

const stubProject = {
  session: PROJECT,
  dir: "/tmp/tmux-ide",
  mission: null,
  goals: [],
  tasks: [],
  agents: [],
};

test.describe("project shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if (path === "/api/sessions") {
        await route.fulfill({
          json: {
            sessions: [
              {
                name: PROJECT,
                dir: "/tmp/tmux-ide",
                mission: null,
                stats: { totalTasks: 0, doneTasks: 0, agents: 0, activeAgents: 0 },
              },
            ],
          },
        });
        return;
      }

      const projectMatch = path.match(/^\/api\/project\/([^/]+)(?:\/(.*))?$/);
      if (projectMatch) {
        const [, name, sub] = projectMatch;
        if (decodeURIComponent(name) !== PROJECT) {
          await route.fulfill({ status: 404, json: null });
          return;
        }
        if (!sub) {
          await route.fulfill({ json: stubProject });
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
  });

  test("kanban ↔ agents tab navigation", async ({ page }) => {
    await page.goto(`/project/${encodeURIComponent(PROJECT)}`);

    const agentsTab = page.getByRole("button", { name: "agents", exact: true });
    const kanbanTab = page.getByRole("button", { name: "kanban", exact: true });

    await expect(agentsTab).toBeVisible({ timeout: 15_000 });
    await expect(kanbanTab).toBeVisible();

    await agentsTab.click();
    await expect(page).toHaveURL(/[?&]tab=agents\b/);
    await expect(page.getByText("no agents in this session")).toBeVisible();

    await kanbanTab.click();
    await expect(page).not.toHaveURL(/[?&]tab=agents\b/);
  });

  test("deep link to agents tab", async ({ page }) => {
    await page.goto(`/project/${encodeURIComponent(PROJECT)}?tab=agents`);

    await expect(page.getByText("no agents in this session")).toBeVisible({ timeout: 15_000 });
  });
});
