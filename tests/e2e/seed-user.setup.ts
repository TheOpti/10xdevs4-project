import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test as setup } from "@playwright/test";

const executeFile = promisify(execFile);

setup("create the local E2E user", async () => {
  await executeFile(process.execPath, ["scripts/seed-e2e-user.mjs"], { windowsHide: true });
});
