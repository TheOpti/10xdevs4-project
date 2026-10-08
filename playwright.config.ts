import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

// Astro preview defaults to port 4321. E2E_PORT overrides it when needed locally.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "seed", testMatch: /seed-user\.setup\.ts/ },
    { name: "setup", testMatch: /auth\.setup\.ts/, dependencies: ["seed"] },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
