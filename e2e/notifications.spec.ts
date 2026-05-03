import { expect, test } from "@playwright/test";

const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";

declare global {
  interface Window {
    __pushTestNotification?: (notification: {
      kind: "info" | "success" | "warning" | "error";
      title: string;
      body?: string;
    }) => string;
  }
}

test.describe("notifications view", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/sessions") {
        await route.fulfill({ json: { sessions: [] } });
        return;
      }
      await route.fulfill({ json: [] });
    });
  });

  test("Mod+Shift+N opens notifications and renders pushed items", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press(`${MOD_KEY}+Shift+KeyN`);
    await expect(page.getByTestId("notifications-view")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof window.__pushTestNotification === "function");
    await page.evaluate(() => {
      window.__pushTestNotification?.({
        kind: "info",
        title: "Injected event",
        body: "Event bridge delivered a notification.",
      });
    });

    await expect(page.getByTestId("notification-item")).toContainText("Injected event");
  });
});
