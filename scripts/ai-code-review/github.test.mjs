import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHub, GITHUB_TIMEOUT_MS, ownedSummary, SUMMARY_MARKER } from "./github.mjs";
import { inputFor, modified } from "./fixtures/diffs.mjs";
import { validateInput } from "./input.mjs";

const bot = { id: 41898282, login: "github-actions[bot]", type: "Bot" };
const comment = (id = 1) => ({ id, body: `${SUMMARY_MARKER}\nsummary`, user: bot });
const json = (value, status = 200, headers = {}) => new globalThis.Response(JSON.stringify(value), { status, headers });
const apiFor = (fetchImpl, extra = {}) =>
  createGitHub({ token: "gh-secret", repository: "owner/repo", number: 7 }, { fetchImpl, ...extra });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded GitHub API", () => {
  it("uses fixed-origin authenticated requests and acquires input as data", async () => {
    const fixture = modified();
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url.startsWith("https://api.github.com/repos/owner/repo/")).toBe(true);
      expect(options).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer gh-secret" } });
      if (url.includes("/files?")) return json([fixture.file]);
      expect(options.headers.Accept).toBe("application/vnd.github.diff");
      return new globalThis.Response(fixture.diff);
    });
    const input = await apiFor(fetchImpl).getInput({ title: "$(touch x)", body: "@all", changed_files: 1 });
    expect(validateInput(input).status).toBe("complete");
    expect(input.title).toBe("$(touch x)");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("paginates files and preserves every page", async () => {
    const fixtures = Array.from({ length: 101 }, (_, index) => modified(`file${index}.js`));
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("page=1"))
        return json(
          fixtures.slice(0, 100).map((item) => item.file),
          200,
          { link: '<https://evil.example>; rel="next"' },
        );
      if (url.endsWith("page=2")) return json([fixtures[100].file]);
      return new globalThis.Response(inputFor(...fixtures).diff);
    });
    const input = await apiFor(fetchImpl).getInput({ title: "Change", body: null, changed_files: 101 });
    expect(input.filePages.map((page) => page.length)).toEqual([100, 1]);
    expect(validateInput(input).status).toBe("complete");
    expect(fetchImpl.mock.calls.every(([url]) => !url.includes("evil"))).toBe(true);
  });

  it("finds only a verified bot-owned summary through comment pagination", async () => {
    const fake = { ...comment(), user: { id: 99, login: "user", type: "User" } };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          Array.from({ length: 100 }, () => fake),
          200,
          { link: '<ignored>; rel="next"' },
        ),
      )
      .mockResolvedValueOnce(json([comment(5)]));
    expect((await apiFor(fetchImpl).findSummary()).id).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: 99, login: "github-actions[bot]", type: "Bot" },
    { id: 41898282, login: "other", type: "Bot" },
    { id: 41898282, login: "github-actions[bot]", type: "User" },
  ])("never edits a marker owned by an unverified account %j", async (user) => {
    const fake = { ...comment(), user };
    expect(ownedSummary(fake)).toBe(false);
    const fetchImpl = vi.fn(async () => json([fake]));
    const api = apiFor(fetchImpl);
    expect(await api.findSummary()).toBeNull();
    await expect(api.writeSummary(fake, "new")).rejects.toThrow("unowned-summary");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("creates and updates the same bot-owned comment without editing user comments", async () => {
    const fetchImpl = vi.fn(async (_url, options) => json({ ...comment(), body: JSON.parse(options.body).body }));
    const api = apiFor(fetchImpl);
    const created = await api.writeSummary(null, `${SUMMARY_MARKER}\nfirst`);
    await api.writeSummary(created, `${SUMMARY_MARKER}\nupdated`);
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ["https://api.github.com/repos/owner/repo/issues/7/comments", "POST"],
      ["https://api.github.com/repos/owner/repo/issues/comments/1", "PATCH"],
    ]);
  });

  it("fails closed on duplicate summaries or exhausted comment pagination", async () => {
    await expect(apiFor(vi.fn(async () => json([comment(1), comment(2)]))).findSummary()).rejects.toThrow(
      "duplicate-owned-summaries",
    );
    const fetchImpl = vi.fn(async () =>
      json(
        Array.from({ length: 100 }, () => ({ id: 8, body: "user" })),
        200,
        { link: '<ignored>; rel="next"' },
      ),
    );
    await expect(apiFor(fetchImpl).findSummary()).rejects.toThrow("github-pagination-limit");
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("provisions missing labels, rereads create conflicts and normalizes only outcome colors", async () => {
    const stored = new Map([
      ["ai-cr:passed", { color: "badbad" }],
      ["ai-cr:review", { color: "abcdef" }],
    ]);
    const fetchImpl = vi.fn(async (url, options) => {
      const name = decodeURIComponent(url.split("/").at(-1));
      if (options.method === "GET") return stored.has(name) ? json(stored.get(name)) : json({}, 404);
      const body = JSON.parse(options.body);
      if (options.method === "POST") {
        stored.set(body.name, { color: "badbad" });
        return json({}, 422);
      }
      stored.set(name, body);
      return json(body);
    });
    await apiFor(fetchImpl).ensureLabels();
    expect(stored.get("ai-cr:failed").color).toBe("d73a4a");
    expect(stored.get("ai-cr:passed").color).toBe("0e8a16");
    expect(stored.get("ai-cr:review").color).toBe("abcdef");
  });

  it("removes outcome labels individually and adds only the chosen label", async () => {
    const fetchImpl = vi.fn(async (_url, options) => json({}, options.method === "DELETE" ? 404 : 200));
    const api = apiFor(fetchImpl);
    await api.clearOutcomes();
    await api.addOutcome("fail");
    expect(fetchImpl.mock.calls.map(([url, options]) => [url.split("/").at(-1), options.method])).toEqual([
      ["ai-cr%3Afailed", "DELETE"],
      ["ai-cr%3Apassed", "DELETE"],
      ["labels", "POST"],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ labels: ["ai-cr:failed"] });
  });

  it("attempts both label removals even if one fails", async () => {
    const fetchImpl = vi.fn(async () => json({ message: "secret" }, 500));
    await expect(apiFor(fetchImpl).clearOutcomes()).rejects.toThrow("github-request-failed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(["headers", "body"])("bounds time spent waiting for %s", async (stage) => {
    vi.useFakeTimers();
    let signal;
    const fetchImpl = vi.fn(async (_url, options) => {
      signal = options.signal;
      if (stage === "headers")
        return new Promise(() => {
          /* Simulate a stalled transport. */
        });
      return new globalThis.Response(new globalThis.ReadableStream());
    });
    const assertion = expect(apiFor(fetchImpl).getPull()).rejects.toThrow("github-timeout");
    await vi.advanceTimersByTimeAsync(GITHUB_TIMEOUT_MS);
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps raw diff bytes before returning input and does not log raw errors", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async (url) =>
      url.includes("/files?") ? json([modified().file]) : new globalThis.Response(Buffer.alloc(102401)),
    );
    await expect(apiFor(fetchImpl).getInput({ changed_files: 1 })).rejects.toThrow("input-limit");
    await expect(
      apiFor(
        vi.fn(async () => {
          throw new Error("gh-secret raw diff");
        }),
      ).getPull(),
    ).rejects.toThrow(/^github-request-failed$/);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("enforces a total operation budget", async () => {
    let time = 0;
    const fetchImpl = vi.fn(async () => json({}));
    const api = apiFor(fetchImpl, { now: () => time });
    time = 360001;
    await expect(api.getPull()).rejects.toThrow("github-budget-exhausted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
