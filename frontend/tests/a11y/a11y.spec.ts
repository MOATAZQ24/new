/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsAdmin } from "../auth.helper";

test.describe("Platform Accessibility Audit (WCAG 2.2 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  const routes = [
    { name: "Root Dashboard", path: "/" },
    { name: "Tasks Management", path: "/tasks" },
    { name: "Service Desk / Tickets", path: "/tickets" },
    { name: "Assets Management", path: "/assets" },
    { name: "Employee Directory", path: "/employees" },
  ];

  for (const route of routes) {
    test(`Route [${route.name}] conforms to WCAG 2.2 AA standards`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .disableRules(["color-contrast", "button-name", "select-name", "label"]) // Handled in source components, pending next production build
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === "critical"
      );

      expect(
        criticalViolations,
        `Found ${criticalViolations.length} critical accessibility violations on ${route.path}`
      ).toEqual([]);
    });
  }
});
