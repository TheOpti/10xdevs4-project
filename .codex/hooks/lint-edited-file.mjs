import { lint, lintableFiles, patchFiles, readPayload } from "./hook-utils.mjs";

const payload = await readPayload();
const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
const files = lintableFiles(patchFiles(payload), cwd);
const result = await lint(files, cwd);

if (result.code !== 0) {
  process.stderr.write(`ESLint reported errors in edited files:\n${result.output}`);
  process.exit(2);
}
