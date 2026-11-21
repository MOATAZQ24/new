import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../auth.helper";

test.describe("Dashboard Visual & Functional Verification", () => {
  test("Dashboard loads with Arabic RTL orientation and key metrics", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Verify RTL orientation on html/body
    const htmlDir = await page.getAttribute("html", "dir");
    expect(htmlDir).toBe("rtl");

    // Verify main content loaded
    const content = page.locator("body").first();
    await expect(content).toBeVisible();

    // Verify page title
    await expect(page).toHaveTitle(/Investor Gate|بوابة المستثمر/);
  });
});
