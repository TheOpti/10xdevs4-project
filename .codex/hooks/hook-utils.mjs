import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const lintExtensions = new Set([".astro", ".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

export async function readPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

export function patchFiles(payload) {
  const patch = payload?.tool_input?.command;
  if (typeof patch !== "string") return [];
  return [...patch.matchAll(/^\*\*\* (?:Update File|Add File|Move to): (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((file) => typeof file === "string" && file.length > 0);
}

export function lintableFiles(files, cwd) {
  return [...new Set(files)]
    .map((file) => (isAbsolute(file) ? file : resolve(cwd, file)))
    .filter((file) => lintExtensions.has(file.slice(file.lastIndexOf("."))))
    .filter(existsSync);
}

export function run(command, args, cwd) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      shell: false,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolveResult({ code: 1, output: error.message }));
    child.on("close", (code) => resolveResult({ code: code ?? 1, output }));
  });
}

export async function repositoryRoot(cwd) {
  const result = await run("git", ["rev-parse", "--show-toplevel"], cwd);
  return result.code === 0 ? result.output.trim() : null;
}

export async function lint(files, cwd) {
  if (files.length === 0) return { code: 0, output: "" };
  const eslint = process.env.CODEX_HOOK_ESLINT ?? resolve(cwd, "node_modules/eslint/bin/eslint.js");
  if (!existsSync(eslint)) return { code: 1, output: `ESLint executable is missing: ${eslint}` };
  return run(process.execPath, [eslint, "--quiet", ...files], cwd);
}
