import { expect, test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;

  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env.e2e");
  }

  await page.goto("/auth/signin");
  await expect(async () => {
    await page.getByLabel("Email").fill("");
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password", { exact: true }).fill("");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
