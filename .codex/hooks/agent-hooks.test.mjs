import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const created = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((path) => import("node:fs/promises").then(({ rm }) => rm(path, { recursive: true, force: true }))),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-hooks-"));
  created.push(root);
  await mkdir(join(root, "src"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "hooks@example.test"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Hook test"], { cwd: root });
  await writeFile(join(root, "README.md"), "baseline\n");
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-qm", "baseline"], { cwd: root });
  return root;
}

function invoke(script, payload, cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(payload);
  });
}

const lintScript = join(process.cwd(), ".codex/hooks/lint-edited-file.mjs");
const stopScript = join(process.cwd(), ".codex/hooks/end-of-turn.mjs");

describe("Codex quality hooks", () => {
  it("ignores empty, invalid, non-patch, missing, and unsupported-file payloads", async () => {
    const root = await fixture();
    for (const payload of [
      "{}",
      "not json",
      JSON.stringify({ tool_input: {} }),
      JSON.stringify({
        tool_input: { command: "*** Begin Patch\n*** Update File: README.md\n*** End Patch" },
        cwd: root,
      }),
      JSON.stringify({
        tool_input: { command: "*** Begin Patch\n*** Update File: src/missing.ts\n*** End Patch" },
        cwd: root,
      }),
    ]) {
      expect((await invoke(lintScript, payload, root)).code).toBe(0);
    }
  });

  it("reports every lintable file named in an apply_patch payload", async () => {
    const root = await fixture();
    const fakeEslint = join(root, "fake-eslint.mjs");
    await writeFile(fakeEslint, 'console.error(`lint failure ${process.argv.slice(2).join(" ")}`); process.exit(1);\n');
    await writeFile(join(root, "src", "one.ts"), "export const one = 1;\n");
    await writeFile(join(root, "src", "two.ts"), "const unused = 1;\n");
    const payload = JSON.stringify({
      cwd: root,
      tool_input: {
        command: "*** Begin Patch\n*** Update File: src/one.ts\n*** Update File: src/two.ts\n*** End Patch",
      },
    });
    const result = await invoke(lintScript, payload, root, { CODEX_HOOK_ESLINT: fakeEslint });
    expect(result.code, result.stderr).toBe(2);
    expect(result.stderr).toContain("two.ts");
  });

  it("lets a Stop retry finish without running checks", async () => {
    const root = await fixture();
    await writeFile(join(root, "src", "broken.ts"), "const unused = 1;\n");
    expect((await invoke(stopScript, JSON.stringify({ cwd: root, stop_hook_active: true }), root)).code).toBe(0);
  });
});
