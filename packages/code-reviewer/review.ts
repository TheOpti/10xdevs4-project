import { Codex } from "@openai/codex-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_JSON_SCHEMA, REVIEWER_PROMPT, ReviewResult } from "./common/review-schema.js";

async function readDiff(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function review(diff: string): Promise<ReviewResult> {
  // Empty temporary directory: the agent sees neither the repo nor its AGENTS.md;
  // the diff is supplied exclusively via the prompt. Equivalent to settingSources: [] from the lesson.
  const sandboxDir = await mkdtemp(join(tmpdir(), "code-review-"));

  try {
    const codex = new Codex(); // authenticate via ~/.codex or CODEX_API_KEY env var

    const thread = codex.startThread({
      workingDirectory: sandboxDir,
      skipGitRepoCheck: true, // temporary directory is not a git repo
      sandboxMode: "read-only", // the reviewer makes no changes
      approvalPolicy: "never", // no approval prompts (non-interactive mode)
      networkAccessEnabled: false, // no network access
      // model: "gpt-5.3-codex",     // optional: force a specific model
      // modelReasoningEffort: "medium",
    });

    // The Codex SDK has no separate system prompt field, so the reviewer role
    // is part of the turn prompt.
    const turn = await thread.run(`${REVIEWER_PROMPT}\n\nReview this diff:\n\n${diff}`, {
      outputSchema: REVIEW_JSON_SCHEMA,
    });

    // Token usage goes to stderr so stdout stays clean JSON
    // eslint-disable-next-line no-console
    if (turn.usage) console.error("usage:", JSON.stringify(turn.usage));

    const parsed = ReviewResult.safeParse(JSON.parse(turn.finalResponse));
    if (!parsed.success) {
      throw new Error(`Invalid structured output: ${parsed.error.message}`);
    }
    return parsed.data;
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
}

const diff = await readDiff();
if (!diff.trim()) {
  // eslint-disable-next-line no-console
  console.error("No diff on stdin. Usage: git diff | npm run review");
  process.exit(2);
}

const result = await review(diff);
// eslint-disable-next-line no-console
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.verdict === "fail" ? 1 : 0; // useful in CI (M5L3)
