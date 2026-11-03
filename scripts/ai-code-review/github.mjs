import { Buffer } from "node:buffer";
import { DIFF_BYTE_LIMIT, FILE_LIMIT } from "./input.mjs";

export const SUMMARY_MARKER = "<!-- ai-cr:summary:v1 -->";
export const LABELS = Object.freeze({ "ai-cr:failed": "d73a4a", "ai-cr:passed": "0e8a16", "ai-cr:review": "1d76db" });
export const GITHUB_TIMEOUT_MS = 15_000;
export class GitHubError extends Error {
  constructor(reason, status = 0) {
    super(reason);
    this.status = status;
  }
}

export const ownedSummary = (comment) =>
  comment?.user?.id === 41898282 &&
  comment.user.login === "github-actions[bot]" &&
  comment.user.type === "Bot" &&
  typeof comment.body === "string" &&
  comment.body.startsWith(SUMMARY_MARKER) &&
  Number.isSafeInteger(comment.id);

/** Fixed API origin, bounded pagination and a shared request/time budget leave time for failure cleanup. */
export function createGitHub({ token, repository, number }, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (
    typeof token !== "string" ||
    !token.trim() ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isSafeInteger(number) ||
    number <= 0
  )
    throw new GitHubError("invalid-github-configuration");
  const root = `/repos/${repository}`;
  const issue = `${root}/issues/${number}`;
  const pull = `${root}/pulls/${number}`;
  const started = now();
  let requests = 0;
  async function request(path, { method = "GET", body, cap = 1024 * 1024, raw = false } = {}) {
    if (++requests > 120 || now() - started > 360_000) throw new GitHubError("github-budget-exhausted");
    const controller = new globalThis.AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = globalThis.setTimeout(() => {
        controller.abort();
        reject(new GitHubError("github-timeout"));
      }, GITHUB_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const response = await fetchImpl(`https://api.github.com${path}`, {
            method,
            redirect: "error",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: raw ? "application/vnd.github.diff" : "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "memoro-ai-review",
              "Content-Type": "application/json",
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          if (!response.ok) {
            void response.body?.cancel().catch(() => {
              /* Preserve the safe HTTP error. */
            });
            throw new GitHubError("github-request-failed", response.status);
          }
          const chunks = [];
          let size = 0;
          if (response.body) {
            const reader = response.body.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > cap) throw new GitHubError(raw ? "input-limit" : "github-response-limit");
                chunks.push(Buffer.from(value));
              }
            } finally {
              void reader.cancel().catch(() => {
                /* Cancellation must not hide the read error. */
              });
              reader.releaseLock();
            }
          }
          const text = Buffer.concat(chunks).toString("utf8");
          return {
            data: raw ? text : text ? JSON.parse(text) : null,
            next: /rel="next"/.test(response.headers.get("link") ?? ""),
          };
        })(),
      ]);
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError("github-request-failed");
    } finally {
      globalThis.clearTimeout(timer);
      controller.abort();
    }
  }

  async function pages(path, maximum, cap = 1024 * 1024) {
    const result = [];
    for (let page = 1; page <= maximum; page++) {
      const { data, next } = await request(`${path}?per_page=100&page=${page}`, { cap });
      if (!Array.isArray(data) || data.length > 100 || (next && data.length !== 100))
        throw new GitHubError("github-pagination-invalid");
      result.push(data);
      if (!next) return result;
    }
    throw new GitHubError("github-pagination-limit");
  }

  async function removeLabel(name) {
    try {
      await request(`${issue}/labels/${encodeURIComponent(name)}`, { method: "DELETE" });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  return {
    async getPull() {
      return (await request(pull)).data;
    },
    async getInput(pr) {
      if (!Number.isSafeInteger(pr.changed_files) || pr.changed_files < 1 || pr.changed_files > FILE_LIMIT)
        throw new GitHubError("input-limit");
      let filePages;
      try {
        filePages = await pages(`${pull}/files`, 30, 2 * 1024 * 1024);
      } catch (error) {
        if (["github-response-limit", "github-pagination-limit", "github-pagination-invalid"].includes(error.message))
          throw new GitHubError("input-limit");
        throw error;
      }
      const { data: diff } = await request(pull, { raw: true, cap: DIFF_BYTE_LIMIT });
      return { title: pr.title, description: pr.body, changedFiles: pr.changed_files, filePages, diff };
    },
    async ensureLabels() {
      for (const [name, color] of Object.entries(LABELS)) {
        const path = `${root}/labels/${encodeURIComponent(name)}`;
        let label;
        try {
          label = (await request(path)).data;
        } catch (error) {
          if (error.status !== 404) throw error;
          try {
            label = (await request(`${root}/labels`, { method: "POST", body: { name, color } })).data;
          } catch (conflict) {
            if (![409, 422].includes(conflict.status)) throw conflict;
            label = (await request(path)).data;
          }
        }
        if (name !== "ai-cr:review" && label?.color?.toLowerCase() !== color) {
          await request(path, { method: "PATCH", body: { color } });
        }
      }
    },
    async findSummary() {
      const comments = (await pages(`${issue}/comments`, 10, 2 * 1024 * 1024)).flat();
      const owned = comments.filter(ownedSummary);
      if (owned.length > 1) throw new GitHubError("duplicate-owned-summaries");
      return owned[0] ?? null;
    },
    async writeSummary(comment, body) {
      if (typeof body !== "string" || body.length > 60000) throw new GitHubError("invalid-summary");
      if (comment && !ownedSummary(comment)) throw new GitHubError("unowned-summary");
      const result = await request(comment ? `${root}/issues/comments/${comment.id}` : `${issue}/comments`, {
        method: comment ? "PATCH" : "POST",
        body: { body },
      });
      if (!ownedSummary(result.data)) throw new GitHubError("unowned-summary");
      return result.data;
    },
    removeLabel,
    async clearOutcomes() {
      const results = await Promise.allSettled([removeLabel("ai-cr:failed"), removeLabel("ai-cr:passed")]);
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    },
    async addOutcome(verdict) {
      if (!["pass", "fail"].includes(verdict)) throw new GitHubError("invalid-verdict");
      await request(`${issue}/labels`, {
        method: "POST",
        body: { labels: [verdict === "pass" ? "ai-cr:passed" : "ai-cr:failed"] },
      });
    },
  };
}
