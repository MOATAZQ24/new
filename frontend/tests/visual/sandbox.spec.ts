import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../auth.helper";

test.describe("Developer Sandbox & Auth View Verification", () => {
  test("Sandbox or Login view renders properly", async ({ page }) => {
    await loginAsAdmin(page);

    // If sandbox is available on active server
    const res = await page.goto("/sandbox", { waitUntil: "domcontentloaded" });
    if (res && res.status() === 200) {
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
    } else {
      // In pre-build mode, verify root authenticated dashboard
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveTitle(/Investor Gate|بوابة المستثمر/);
    }
  });
});
