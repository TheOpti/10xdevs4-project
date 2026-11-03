import { describe, expect, it } from "vitest";
import { CRITERIA, parseReview } from "./contract.mjs";
import { renderReport, escapeText, summaryRunId } from "./report.mjs";

const context = {
  snapshot: { head: { sha: "a".repeat(40) }, base: { sha: "b".repeat(40) } },
  runId: "100",
  repository: "owner/repo",
  descriptionNotice: "Description excerpt: first 8,000 Unicode code points.",
};
describe("bounded safe reports", () => {
  it("escapes markup, links, images, mentions and workflow-command syntax", () => {
    const text = escapeText("@everyone <script> [x](https://evil) ![img](x) `code`\n::error::");
    expect(text).not.toMatch(/@|<|>|\[|\]|`|::|\n/);
    expect(text).toContain("&#64;everyone");
  });
  it("includes calculated scores, SHAs, model, usage and evidence limits", () => {
    const review = {
      summary: "Useful change",
      criteria: Object.fromEntries(CRITERIA.map((key) => [key, { score: 6, explanation: "Evidence" }])),
    };
    const body = renderReport(
      {
        ...parseReview(JSON.stringify(review)),
        model: "vendor/model",
        usage: { total_tokens: 10 },
        generationId: "gen-1",
      },
      context,
    );
    expect(body).toContain("**Verdict: PASS**");
    expect(body).toContain("average 6.00");
    expect(body).toContain("a".repeat(40));
    expect(body).toContain("b".repeat(40));
    expect(body).toContain("total_tokens: 10");
    expect(body).toContain("https://github.com/owner/repo/actions/runs/100");
    expect(body).toContain("no code or tests were executed");
    expect(summaryRunId({ body })).toBe(100n);
  });
  it("bounds even maximally escapable model content below the comment limit", () => {
    const review = {
      summary: "@".repeat(2000),
      criteria: Object.fromEntries(CRITERIA.map((key) => [key, { score: 6, explanation: "@".repeat(1000) }])),
    };
    const body = renderReport({ ...parseReview(JSON.stringify(review)), model: "@".repeat(10000) }, context);
    expect(body.length).toBeLessThan(60000);
    expect(body).not.toContain("@");
  });
  it.each(["pending", "unavailable", "operational-error", "superseded"])(
    "renders %s without obsolete scores or raw reasons",
    (status) => {
      const body = renderReport({ status, reason: "secret RAW_DIFF", verdict: "pass", average: 10 }, context);
      expect(body).not.toMatch(/secret|RAW_DIFF|Verdict|average/);
      expect(body).toContain("ai-cr:review");
    },
  );
});
