/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { Page } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
  // Navigate to login page
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Fill credentials if on login page
  const usernameInput = page.locator("input[name='username'], input[type='text']").first();
  const passwordInput = page.locator("input[name='password'], input[type='password']").first();

  if (await usernameInput.isVisible()) {
    await usernameInput.fill("admin");
    await passwordInput.fill("Admin@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
  }
}
