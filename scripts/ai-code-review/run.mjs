import { appendFile, readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { nonReviewOutcome, parseReview } from "./contract.mjs";
import { reviewWithOpenRouter, validProviderConfig } from "./openrouter.mjs";
import { createGitHub, GitHubError } from "./github.mjs";
import { validateInput } from "./input.mjs";
import { renderReport, summaryRunId } from "./report.mjs";

/** The provider boundary is independently injectable and never receives the GitHub token. */
export async function runReview({ githubToken, apiKey, model, input } = {}, { review = reviewWithOpenRouter } = {}) {
  if (typeof githubToken !== "string" || !githubToken.trim() || !validProviderConfig({ apiKey, model })) {
    return nonReviewOutcome("operational-error", "missing-or-invalid-configuration");
  }
  if (input == null) return nonReviewOutcome("operational-error", "github-integration-not-configured");
  return review({ apiKey, model, input });
}

export function eligible(pr, repository) {
  return (
    pr?.state === "open" &&
    pr.draft === false &&
    pr.base?.ref === "main" &&
    pr.head?.repo?.full_name === repository &&
    pr.base?.repo?.full_name === repository
  );
}

function snapshotOf(pr) {
  if (
    !/^[a-f0-9]{40}$/.test(pr?.head?.sha) ||
    !/^[a-f0-9]{40}$/.test(pr?.base?.sha) ||
    typeof pr.title !== "string" ||
    (pr.body !== null && typeof pr.body !== "string")
  )
    throw new GitHubError("invalid-pr-metadata");
  return {
    head: { sha: pr.head.sha },
    base: { sha: pr.base.sha },
    title: pr.title,
    body: pr.body,
    changedFiles: pr.changed_files,
  };
}

export async function runPullReview(
  { event, eventName, repository, runId, githubToken, apiKey, model },
  { github, review = reviewWithOpenRouter } = {},
) {
  if (
    eventName !== "pull_request_target" ||
    !["opened", "synchronize", "reopened", "ready_for_review", "labeled"].includes(event?.action) ||
    (event.action === "labeled" && (event.label?.name !== "ai-cr:review" || event.sender?.type !== "User"))
  )
    return nonReviewOutcome("skipped", "ineligible-event");
  if (!eligible(event.pull_request, repository)) return nonReviewOutcome("skipped", "ineligible-pr");
  if (event.repository?.full_name !== repository || !/^\d{1,30}$/.test(runId ?? ""))
    return nonReviewOutcome("operational-error", "invalid-event");
  let api;
  let snapshot;
  let accepted = false;
  let descriptionNotice;
  let newerSummary = false;
  const context = () => ({ snapshot, runId, repository, descriptionNotice });
  async function currentSummary() {
    const comment = await api.findSummary();
    if (summaryRunId(comment) > BigInt(runId)) {
      newerSummary = true;
      throw new GitHubError("newer-review");
    }
    return comment;
  }
  async function publish(result) {
    const comment = await currentSummary();
    await api.writeSummary(comment, renderReport({ model, ...result }, context()));
  }
  async function fresh() {
    const current = await api.getPull();
    return eligible(current, repository) && JSON.stringify(snapshotOf(current)) === JSON.stringify(snapshot);
  }
  async function discard() {
    await currentSummary();
    await api.clearOutcomes();
    const result = nonReviewOutcome("superseded", "pr-changed");
    await publish(result);
    return result;
  }
  try {
    api = github ?? createGitHub({ token: githubToken, repository, number: event.pull_request.number });
    const pr = await api.getPull();
    if (!eligible(pr, repository)) return nonReviewOutcome("skipped", "ineligible-pr");
    snapshot = snapshotOf(pr);
    const eventSnapshot = snapshotOf(event.pull_request);
    if (
      ["title", "body"].some((key) => snapshot[key] !== eventSnapshot[key]) ||
      snapshot.head.sha !== eventSnapshot.head.sha ||
      snapshot.base.sha !== eventSnapshot.base.sha
    )
      return nonReviewOutcome("superseded", "queued-event-obsolete");
    await currentSummary();
    accepted = true;
    await api.ensureLabels();
    if (event.action === "labeled" || pr.labels?.some((label) => label.name === "ai-cr:review"))
      await api.removeLabel("ai-cr:review");
    await api.clearOutcomes();
    await publish({ status: "pending" });
    if (!validProviderConfig({ apiKey, model })) throw new GitHubError("invalid-provider-config");
    const input = await api.getInput(pr);
    const validated = validateInput(input);
    if (validated.status !== "complete") {
      if (!(await fresh())) return await discard();
      await publish(validated);
      return validated;
    }
    descriptionNotice = validated.input.descriptionNotice;
    if (!(await fresh())) return await discard();
    const provider = await runReview({ githubToken, apiKey, model, input }, { review });
    if (!(await fresh())) return await discard();
    // Publication never trusts an injected/provider verdict; validate and calculate again locally.
    const result =
      provider?.status === "complete"
        ? { ...provider, ...parseReview(JSON.stringify(provider.review)) }
        : nonReviewOutcome("operational-error", "provider-failed");
    await publish(result);
    if (!(await fresh())) return await discard();
    if (result.status !== "complete") return nonReviewOutcome("operational-error", "provider-failed");
    await api.addOutcome(result.verdict);
    if (!(await fresh())) return await discard();
    return { ...result, reviewedHeadSha: snapshot.head.sha };
  } catch (error) {
    if (newerSummary) return nonReviewOutcome("superseded", "newer-review");
    const result = nonReviewOutcome(
      error instanceof GitHubError && error.message === "input-limit" ? "unavailable" : "operational-error",
      "review-unavailable",
    );
    if (accepted) {
      // Re-read ownership after uncertain writes (a create may have succeeded before a timeout).
      // Try both cleanup operations even if one fails; a later eligible run can recover.
      try {
        await currentSummary();
        const cleanup = await Promise.allSettled([api.clearOutcomes(), publish(result)]);
        if (cleanup.some((item) => item.status === "rejected"))
          return nonReviewOutcome("operational-error", "cleanup-failed");
      } catch {
        return nonReviewOutcome(newerSummary ? "superseded" : "operational-error", "cleanup-unavailable");
      }
    }
    return result;
  }
}

export async function main(env = process.env) {
  let result;
  try {
    if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("unsupported-runtime");
    if (!env.GITHUB_EVENT_PATH || (await stat(env.GITHUB_EVENT_PATH)).size > 1024 * 1024)
      throw new Error("invalid-event");
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    result = await runPullReview({
      event,
      eventName: env.GITHUB_EVENT_NAME,
      repository: env.GITHUB_REPOSITORY,
      runId: env.GITHUB_RUN_ID,
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
