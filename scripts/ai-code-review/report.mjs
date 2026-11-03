import { CRITERIA } from "./contract.mjs";
import { SUMMARY_MARKER } from "./github.mjs";

// Numeric entities prevent Markdown/HTML injection and active mentions; bound before escaping.
export function escapeText(value, limit = 600) {
  return [...String(value ?? "")]
    .slice(0, limit)
    .map((character) => (character.codePointAt(0) < 32 || character.codePointAt(0) === 127 ? " " : character))
    .join("")
    .replace(/[&<>@`*_{}[\]()#+.!|~\\:=/-]/g, (character) => `&#${character.codePointAt(0)};`);
}
export function summaryRunId(comment) {
  const match = /^<!-- ai-cr:summary:v1 -->\n<!-- ai-cr:run:(\d+) -->/.exec(comment?.body ?? "");
  return match ? BigInt(match[1]) : 0n;
}

export function renderReport(
  { status, review, average, verdict, model, usage, generationId },
  { snapshot, runId, repository, descriptionNotice },
) {
  const lines = [SUMMARY_MARKER, `<!-- ai-cr:run:${/^\d+$/.test(runId) ? runId : "0"} -->`, "## AI code review", ""];
  const states = {
    pending: "Review in progress. Previous outcome labels have been cleared.",
    unavailable: "Review unavailable: input is unsupported, incomplete, or exceeds the configured limits.",
    "operational-error": "Review unavailable: configuration, provider, or GitHub operation failed.",
    superseded: "Review superseded: PR state changed. Obsolete scores have been discarded.",
  };
  if (status === "complete") {
    lines.push(
      `**Verdict: ${verdict === "pass" ? "PASS" : "FAIL"}** — average ${average.toFixed(2)}/10 (calculated locally).`,
      "",
      escapeText(review.summary, 1200),
      "",
    );
    for (const name of CRITERIA)
      lines.push(`- **${name}: ${review.criteria[name].score}/10** — ${escapeText(review.criteria[name].explanation)}`);
  } else
    lines.push(
      states[status] ?? states["operational-error"],
      "",
      "Retry by having a human add the `ai-cr:review` label to an eligible PR.",
    );
  lines.push(
    "",
    `Head: ${escapeText(snapshot?.head?.sha, 40)}`,
    `Base: ${escapeText(snapshot?.base?.sha, 40)}`,
    `Model: ${escapeText(model, 200)}`,
  );
  if (generationId) lines.push(`Generation: ${escapeText(generationId, 200)}`);
  const metrics = [];
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "cost"]) {
    if (typeof usage?.[key] === "number" && Number.isFinite(usage[key]) && usage[key] >= 0)
      metrics.push(`${key}: ${usage[key]}`);
  }
  if (metrics.length) lines.push(`Usage: ${metrics.join(", ")}`);
  lines.push(
    "",
    "Evidence is limited to the supplied diff and PR text; no code or tests were executed. Missing context does not prove missing tests or abstractions.",
    escapeText(descriptionNotice ?? "Description availability depends on completed input validation.", 200),
    "Publication is not atomic across GitHub comments and labels; reviewed SHAs identify this assessment.",
  );
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && /^\d+$/.test(runId))
    lines.push("", `[Workflow run](https://github.com/${repository}/actions/runs/${runId})`);
  const body = lines.join("\n");
  if (body.length > 60000) throw new Error("report-limit");
  return body;
}
