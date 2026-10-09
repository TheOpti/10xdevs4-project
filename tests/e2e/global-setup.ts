import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

export default async function globalSetup() {
  await executeFile(process.execPath, ["scripts/seed-e2e-user.mjs"], { windowsHide: true });
}
