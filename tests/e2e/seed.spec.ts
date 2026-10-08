import { expect, test } from "@playwright/test";

// Risk source: auth-gate-redirect — a signed-out visitor must not reach a protected dashboard.
test.use({ storageState: { cookies: [], origins: [] } });

test("signed-out visitor is redirected from the dashboard to sign in", async ({ page }) => {
  await page.goto("/dashboard");

  await page.waitForURL("/auth/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // This signed-out redirect creates no data, so cleanup is not needed.
});
