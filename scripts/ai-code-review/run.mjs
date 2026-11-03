import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { nonReviewOutcome } from "./contract.mjs";
import { reviewWithOpenRouter, validProviderConfig } from "./openrouter.mjs";

/** Phase 3 supplies trusted GitHub acquisition/publication; imports never execute the action. */
export async function runReview({ githubToken, apiKey, model, input } = {}, { review = reviewWithOpenRouter } = {}) {
  if (typeof githubToken !== "string" || !githubToken.trim() || !validProviderConfig({ apiKey, model })) {
    return nonReviewOutcome("operational-error", "missing-or-invalid-configuration");
  }
  if (input == null) return nonReviewOutcome("operational-error", "github-integration-not-configured");
  return review({ apiKey, model, input });
}

export async function main(env = process.env) {
  let result;
  try {
    if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("unsupported-runtime");
    result = await runReview({
      githubToken: env.GITHUB_TOKEN,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.AI_REVIEW_MODEL,
    });
  } catch {
    result = nonReviewOutcome("operational-error", "action-error");
  }

  const statuses = ["complete", "operational-error", "unavailable", "skipped", "superseded"];
  const status = statuses.includes(result.status) ? result.status : "operational-error";
  const sha = /^[a-f0-9]{40}$/.test(result.reviewedHeadSha ?? "") ? result.reviewedHeadSha : "";

  try {
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `status=${status}\nreviewed-head-sha=${sha}\n`);
  } catch {
    return 1;
  }

  // Only fixed local status values reach logs; no input, credentials or provider payloads.
  console.log(`AI review: ${status}`);
  return ["complete", "skipped", "superseded"].includes(status) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
