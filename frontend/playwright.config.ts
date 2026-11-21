/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * Investor Gate OS - Automated Playwright & Visual Regression Suite
 * Tests Desktop, Tablet, and Mobile across Arabic RTL interface.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000",
    channel: "chrome",
    trace: "on-first-retry",
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    extraHTTPHeaders: {
      "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8",
    },
  },

  projects: [
    // 1. Desktop 1920x1080 (Primary Reference)
    {
      name: "Desktop-1080p",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // 2. Desktop Standard 1440x900
    {
      name: "Desktop-1440p",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },

    // 3. Tablet iPad Pro 768x1024
    {
      name: "Tablet-768p",
      use: {
        ...devices["iPad (gen 7)"],
        viewport: { width: 768, height: 1024 },
      },
    },

    // 4. Mobile 375x812 (iPhone 14 / Mobile standard)
    {
      name: "Mobile-375p",
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
