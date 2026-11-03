import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CRITERIA } from "./contract.mjs";
import { GitHubError, SUMMARY_MARKER } from "./github.mjs";
import { inputFor, modified } from "./fixtures/diffs.mjs";
import { main, runPullReview } from "./run.mjs";

function fixture() {
  const pr = {
    number: 7,
    state: "open",
    draft: false,
    title: "Change",
    body: "Intent",
    changed_files: 1,
    head: { sha: "a".repeat(40), repo: { full_name: "owner/repo" } },
    base: { sha: "b".repeat(40), ref: "main", repo: { full_name: "owner/repo" } },
  };
  const options = {
    eventName: "pull_request_target",
    repository: "owner/repo",
    runId: "100",
    githubToken: "gh-secret",
    apiKey: "or-secret",
    model: "vendor/model",
    event: {
      action: "opened",
      repository: { full_name: "owner/repo" },
      pull_request: globalThis.structuredClone(pr),
      sender: { type: "User" },
    },
  };
  let comment = null;
  const labels = new Set(["ai-cr:passed", "unrelated", "ai-cr:review"]);
  const calls = [];
  const api = {
    getPull: vi.fn(async () => globalThis.structuredClone(pr)),
    getInput: vi.fn(async () => inputFor(modified())),
    findSummary: vi.fn(async () => comment),
    ensureLabels: vi.fn(async () => {
      calls.push("ensure");
    }),
    removeLabel: vi.fn(async (name) => {
      calls.push("consume");
      labels.delete(name);
    }),
    clearOutcomes: vi.fn(async () => {
      calls.push("clear");
      labels.delete("ai-cr:passed");
      labels.delete("ai-cr:failed");
    }),
    writeSummary: vi.fn(async (_previous, body) => {
      calls.push(body.includes("in progress") ? "pending" : body.includes("**Verdict:") ? "result" : "notice");
      comment = { id: 1, body };
      return comment;
    }),
    addOutcome: vi.fn(async (verdict) => {
      calls.push("label");
      labels.add(verdict === "pass" ? "ai-cr:passed" : "ai-cr:failed");
    }),
  };
  const provider = {
    status: "complete",
    verdict: "fail",
    review: {
      summary: "Evidence",
      criteria: Object.fromEntries(CRITERIA.map((name) => [name, { score: 6, explanation: "Evidence" }])),
    },
  };
  const review = vi.fn(async () => {
    calls.push("infer");
    return provider;
  });
  const run = () => runPullReview(options, { github: api, review });
  return { pr, options, api, review, provider, run, labels, calls, comment: () => comment };
}

describe("PR review orchestration", () => {
  it.each(["pass", "fail"])("publishes locally calculated %s after pending, inference and summary", async (verdict) => {
    const f = fixture();
    if (verdict === "fail") f.provider.review.criteria.complexity.score = 3;
    const result = await f.run();
    expect(result).toMatchObject({ status: "complete", verdict, reviewedHeadSha: "a".repeat(40) });
    expect(f.calls).toEqual(["ensure", "clear", "pending", "infer", "result", "label"]);
    expect(f.labels).toEqual(
      new Set(["unrelated", "ai-cr:review", verdict === "pass" ? "ai-cr:passed" : "ai-cr:failed"]),
    );
    expect(f.review.mock.calls[0][0]).not.toHaveProperty("githubToken");
  });

  it.each(["draft", "fork", "closed", "retargeted"])("skips current %s PR without side effects", async (kind) => {
    const f = fixture();
    if (kind === "draft") f.pr.draft = true;
    if (kind === "fork") f.pr.head.repo.full_name = "other/fork";
    if (kind === "closed") f.pr.state = "closed";
    if (kind === "retargeted") f.pr.base.ref = "develop";
    expect((await f.run()).status).toBe("skipped");
    expect(f.calls).toEqual([]);
    expect(f.review).not.toHaveBeenCalled();
  });

  it.each(["ai-cr:passed", "ai-cr:failed", "unrelated"])("ignores label event %s before API reads", async (name) => {
    const f = fixture();
    f.options.event.action = "labeled";
    f.options.event.label = { name };
    expect((await f.run()).status).toBe("skipped");
    expect(f.api.getPull).not.toHaveBeenCalled();
  });

  it("consumes a human retry only after eligibility is confirmed and updates one comment on rerun", async () => {
    const f = fixture();
    f.options.event.action = "labeled";
    f.options.event.label = { name: "ai-cr:review" };
    await f.run();
    const first = f.comment().id;
    expect(f.calls.slice(0, 4)).toEqual(["ensure", "consume", "clear", "pending"]);
    expect(f.labels.has("ai-cr:review")).toBe(false);
    await f.run();
    expect(f.comment().id).toBe(first);
    expect(f.api.writeSummary.mock.calls.filter(([previous]) => previous === null)).toHaveLength(1);
  });

  it("consumes a retry left on a draft when ready_for_review makes the PR eligible", async () => {
    const f = fixture();
    f.options.event.action = "ready_for_review";
    f.pr.labels = [{ name: "ai-cr:review" }];
    expect((await f.run()).status).toBe("complete");
    expect(f.api.removeLabel).toHaveBeenCalledWith("ai-cr:review");
  });

  it("does not consume draft or bot retries", async () => {
    for (const kind of ["draft", "bot"]) {
      const f = fixture();
      f.options.event.action = "labeled";
      f.options.event.label = { name: "ai-cr:review" };
      if (kind === "draft") f.pr.draft = true;
      else f.options.event.sender.type = "Bot";
      expect((await f.run()).status).toBe("skipped");
      expect(f.api.removeLabel).not.toHaveBeenCalled();
    }
  });

  it.each(["apiKey", "model"])("clears stale outcomes and reports missing %s without inference", async (key) => {
    const f = fixture();
    f.options[key] = "";
    expect((await f.run()).status).toBe("operational-error");
    expect(f.review).not.toHaveBeenCalled();
    expect(f.labels.has("ai-cr:passed")).toBe(false);
    expect(f.comment().body).toContain("configuration, provider, or GitHub");
  });

  it.each(["malformed", "oversized"])("reports unavailable %s input without provider calls", async (kind) => {
    const f = fixture();
    if (kind === "malformed") f.api.getInput.mockResolvedValue({ ...inputFor(modified()), diff: "incomplete" });
    else f.api.getInput.mockRejectedValue(new GitHubError("input-limit"));
    expect((await f.run()).status).toBe("unavailable");
    expect(f.review).not.toHaveBeenCalled();
    expect(f.comment().body).toContain("input is unsupported");
    expect(f.labels).not.toContain("ai-cr:passed");
  });

  it.each(["head", "base", "body", "title"])("skips obsolete queued %s before any effects", async (field) => {
    const f = fixture();
    if (["head", "base"].includes(field)) f.pr[field].sha = "c".repeat(40);
    else f.pr[field] = "changed";
    expect((await f.run()).status).toBe("superseded");
    expect(f.calls).toEqual([]);
  });

  it.each(["head", "base", "body", "draft", "closed", "retargeted"])(
    "discards %s changes during input acquisition before paid work",
    async (field) => {
      const f = fixture();
      f.api.getInput.mockImplementation(async () => {
        if (["head", "base"].includes(field)) f.pr[field].sha = "c".repeat(40);
        else if (field === "draft") f.pr.draft = true;
        else if (field === "closed") f.pr.state = "closed";
        else if (field === "retargeted") f.pr.base.ref = "develop";
        else f.pr.body = "changed";
        return inputFor(modified());
      });
      expect((await f.run()).status).toBe("superseded");
      expect(f.review).not.toHaveBeenCalled();
      expect(f.comment().body).toContain("Review superseded");
      expect(f.labels).not.toContain("ai-cr:passed");
    },
  );

  it.each(["head", "base", "body"])("discards %s changed during inference", async (field) => {
    const f = fixture();
    f.review.mockImplementation(async () => {
      if (field === "body") f.pr.body = "changed";
      else f.pr[field].sha = "c".repeat(40);
      return f.provider;
    });
    expect((await f.run()).status).toBe("superseded");
    expect(f.api.addOutcome).not.toHaveBeenCalled();
    expect(f.comment().body).not.toContain("**Verdict:");
  });

  it.each(["summary", "label"])("cleans up staleness detected after writing %s", async (step) => {
    const f = fixture();
    if (step === "summary") {
      const original = f.api.writeSummary.getMockImplementation();
      f.api.writeSummary.mockImplementation(async (...args) => {
        const value = await original(...args);
        if (args[1].includes("**Verdict:")) f.pr.body = "changed";
        return value;
      });
    } else {
      f.api.addOutcome.mockImplementation(async () => {
        f.labels.add("ai-cr:passed");
        f.pr.body = "changed";
      });
    }
    expect((await f.run()).status).toBe("superseded");
    expect(f.labels).not.toContain("ai-cr:passed");
    expect(f.comment().body).toContain("Review superseded");
  });

  it.each(["returned", "throw", "invalid-review"])(
    "handles provider failure %s without a quality label",
    async (kind) => {
      const f = fixture();
      if (kind === "throw") f.review.mockRejectedValue(new Error("or-secret RAW-DIFF"));
      else if (kind === "invalid-review") f.provider.review = {};
      else f.review.mockResolvedValue({ status: "operational-error", reason: "or-secret RAW-DIFF" });
      expect((await f.run()).status).toBe("operational-error");
      expect(f.api.addOutcome).not.toHaveBeenCalled();
      expect(f.comment().body).not.toMatch(/or-secret|RAW-DIFF/);
      expect(f.labels).not.toContain("ai-cr:passed");
    },
  );

  it.each(["ensureLabels", "removeLabel", "clearOutcomes", "writeSummary", "addOutcome"])(
    "recovers on a later run after partial %s failure",
    async (method) => {
      const f = fixture();
      f.options.event.action = "labeled";
      f.options.event.label = { name: "ai-cr:review" };
      const original = f.api[method].getMockImplementation();
      f.api[method].mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("ambiguous write secret");
      });
      expect((await f.run()).status).toBe("operational-error");
      expect(f.labels).not.toContain("ai-cr:passed");
      expect((await f.run()).status).toBe("complete");
      expect(f.labels).toContain("ai-cr:passed");
      expect(f.labels).not.toContain("ai-cr:failed");
      expect(f.api.writeSummary.mock.calls.filter(([previous]) => previous === null)).toHaveLength(1);
    },
  );

  it("does not overwrite a newer summary, before or after inference", async () => {
    for (const late of [false, true]) {
      const f = fixture();
      const newer = { id: 2, body: `${SUMMARY_MARKER}\n<!-- ai-cr:run:101 -->\nnewer review` };
      if (late)
        f.review.mockImplementation(async () => {
          f.api.findSummary.mockResolvedValue(newer);
          return f.provider;
        });
      else f.api.findSummary.mockResolvedValue(newer);
      expect((await f.run()).status).toBe("superseded");
      expect(f.api.addOutcome).not.toHaveBeenCalled();
      expect(f.api.writeSummary.mock.calls.every(([previous]) => previous?.id !== 2)).toBe(true);
      if (!late) expect(f.calls).toEqual([]);
    }
  });

  it("reports failed cleanup honestly and a later retry recovers", async () => {
    const f = fixture();
    f.api.clearOutcomes.mockRejectedValue(new Error("offline"));
    expect(await f.run()).toMatchObject({ status: "operational-error", reason: "cleanup-failed" });
    expect(f.review).not.toHaveBeenCalled();
  });
});

it.each(["pass", "fail"])(
  "runs the complete action entry point offline with advisory %s exit status",
  async (verdict) => {
    const f = fixture();
    if (verdict === "fail") f.provider.review.criteria.complexity.score = 3;
    const directory = await mkdtemp(join(tmpdir(), "ai-review-entry-"));
    const eventPath = join(directory, "event.json");
    const outputPath = join(directory, "output");
    let comment = null;
    const labels = new Set(["unrelated", "ai-cr:failed"]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      const json = (data) => new globalThis.Response(JSON.stringify(data));
      if (url === "https://openrouter.ai/api/v1/chat/completions") {
        expect(options.headers.Authorization).toBe("Bearer or-secret");
        return json({
          model: "vendor/model",
          choices: [
            { finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(f.provider.review) } },
          ],
        });
      }
      expect(options.headers.Authorization).toBe("Bearer gh-secret");
      if (options.headers.Accept === "application/vnd.github.diff") return new globalThis.Response(modified().diff);
      if (url.includes("/pulls/7/files?")) return json([modified().file]);
      if (url.endsWith("/pulls/7")) return json(f.pr);
      if (url.includes("/comments?") && options.method === "GET") return json(comment ? [comment] : []);
      if (url.includes("/comments") && ["POST", "PATCH"].includes(options.method)) {
        comment = {
          id: 1,
          body: JSON.parse(options.body).body,
          user: { id: 41898282, login: "github-actions[bot]", type: "Bot" },
        };
        return json(comment);
      }
      if (options.method === "GET" && url.includes("/labels/"))
        return json({
          color: { "ai-cr:passed": "0e8a16", "ai-cr:failed": "d73a4a", "ai-cr:review": "1d76db" }[
            decodeURIComponent(url.split("/").at(-1))
          ],
        });
      if (options.method === "DELETE") {
        labels.delete(decodeURIComponent(url.split("/").at(-1)));
        return json([]);
      }
      if (options.method === "POST" && url.endsWith("/labels")) {
        for (const name of JSON.parse(options.body).labels) labels.add(name);
        return json([]);
      }
      throw new Error("unexpected fixture request");
    });
    try {
      await writeFile(eventPath, JSON.stringify(f.options.event));
      expect(
        await main({
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: "pull_request_target",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "100",
          GITHUB_TOKEN: "gh-secret",
          OPENROUTER_API_KEY: "or-secret",
          AI_REVIEW_MODEL: "vendor/model",
          GITHUB_OUTPUT: outputPath,
        }),
      ).toBe(0);
      expect(await readFile(outputPath, "utf8")).toBe(`status=complete\nreviewed-head-sha=${"a".repeat(40)}\n`);
      expect(labels).toEqual(new Set(["unrelated", verdict === "pass" ? "ai-cr:passed" : "ai-cr:failed"]));
      expect(comment.body).toContain(`**Verdict: ${verdict.toUpperCase()}**`);
      expect(log.mock.calls).toEqual([["AI review: complete"]]);
    } finally {
      fetchSpy.mockRestore();
      log.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it("keeps workflow execution on trusted code, with optional isolated review permissions", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/ai-code-review.yml", import.meta.url), "utf8");
  expect(workflow).toContain("pull_request_target:");
  expect(workflow).toContain("ref: ${{ github.sha }}");
  expect(workflow).toContain("persist-credentials: false");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("pull-requests: write");
  expect(workflow).toContain("timeout-minutes: 10");
  expect(workflow).not.toMatch(
    /pull_request\.head\.sha|npm (?:ci|install|test)|SUPABASE|continue-on-error|pull_request\.body|pull_request\.title/,
  );
  expect(workflow.match(/uses: actions\/[^@]+@[a-f0-9]{40}/g)).toHaveLength(2);
});
