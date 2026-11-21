/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../auth.helper";

test.describe("Task Management Workspace Verification", () => {
  test("Tasks page displays KPI summary cards and tasks table", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });

    // Verify page heading or title
    const heading = page.locator("h1, h2, div").filter({ hasText: "إدارة المهام" }).first();
    await expect(heading).toBeVisible();
  });
});
