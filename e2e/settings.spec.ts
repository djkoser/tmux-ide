import { expect, test, type Page } from "@playwright/test";

const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";

async function mockApi(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.routeWebSocket("**/ws/pty/**", (ws) => {
    ws.send("ready");
  });
}

test.describe("settings view", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("opens settings, switches theme, and applies a keybind override", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("activity-section-settings").click();
    await expect(page.getByTestId("settings-view")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("settings-nav-appearance").click();
    await page.getByTestId("theme-card-catppuccin").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("catppuccin");

    await page.getByTestId("settings-nav-keybinds").click();
    await page.getByTestId("keybind-edit-toggle-terminal").click();
    await page.keyboard.press(`${MOD_KEY}+Shift+KeyY`);
    await expect(page.getByTestId("keybind-value-toggle-terminal")).toContainText("Mod+Shift+Y");

    await page.keyboard.press(`${MOD_KEY}+Shift+KeyY`);
    await expect(page.getByTestId("full-screen-terminal")).toHaveAttribute("data-open", "true");
  });
});
