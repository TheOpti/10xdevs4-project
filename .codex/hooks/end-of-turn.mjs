import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { lint, lintableFiles, readPayload, repositoryRoot, run } from "./hook-utils.mjs";

const payload = await readPayload();
if (payload.stop_hook_active === true) process.exit(0);

const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
const root = await repositoryRoot(cwd);
if (!root) process.exit(0);

const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .concat(execFileSync("git", ["ls-files", "-o", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split(/\r?\n/))
  .filter(Boolean);
if (changed.length === 0) process.exit(0);

const files = lintableFiles(
  changed.map((file) => resolve(root, file)),
  root,
);
const reports = [];
const lintResult = await lint(files, root);
if (lintResult.code !== 0) reports.push(`ESLint errors in changed files:\n${lintResult.output}`);

const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const testResult = await run(process.execPath, [vitest, "run"], root);
if (testResult.code !== 0) reports.push(`Tests fail:\n${testResult.output}`);

const astro = resolve(root, "node_modules/astro/bin/astro.mjs");
const typecheckResult = await run(process.execPath, [astro, "check"], root);
if (typecheckResult.code !== 0) reports.push(`Astro typecheck fails:\n${typecheckResult.output}`);

if (reports.length > 0) {
  process.stderr.write(`Fix these before you finish:\n${reports.join("\n\n")}`);
  process.exit(2);
}
