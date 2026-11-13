import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewRepository, toReviewInput } from "./flashcard-reviews";
import { createClient } from "./supabase";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
const setId = "10000000-0000-4000-8000-000000000001";
const cardId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const input = { requestId, expectedRevision: 0, rating: "hard" as const };
const card = { id: cardId, question: "Q", answer: "A", dueAt: "2026-11-13T12:00:00.123456+00:00", revision: 0 };
const queue = { setId, title: "Study", totalCards: 1, cards: [card] };
const receipt = { ...input, cardId, revision: 1, ratedAt: "2026-11-13T12:00:00Z", dueAt: "2026-11-16T12:00:00Z" };
const headers = new Headers();
const cookies = {} as AstroCookies;

function setup(data: unknown = queue, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  vi.mocked(createClient).mockReturnValue({ rpc } as never);
  const repository = createReviewRepository(headers, cookies);
  if (!repository) throw new Error("Expected repository");
  return { repository, rpc };
}

describe("review repository", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses request-scoped credentials and reports missing configuration", () => {
    vi.mocked(createClient).mockReturnValue(null);
    expect(createReviewRepository(headers, cookies)).toBeNull();
    expect(createClient).toHaveBeenCalledWith(headers, cookies);
  });

  it("loads the exact queue contract, excluding unrecognized private fields", async () => {
    const { repository, rpc } = setup({ ...queue, source_text: "private", cards: [{ ...card, owner_id: "private" }] });
    await expect(repository.getQueue(setId)).resolves.toEqual({ ok: true, data: queue });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_flashcard_review_queue", { set_id: setId });
  });

  it("preserves database due ordering, ID ties and sub-millisecond timestamps without using the local clock", async () => {
    const cards = [
      { ...card, id: "20000000-0000-4000-8000-000000000003", dueAt: "2099-01-01T00:00:00.000001Z" },
      { ...card, id: "20000000-0000-4000-8000-000000000001", dueAt: "2099-01-01T00:00:00.000002Z" },
      { ...card, id: "20000000-0000-4000-8000-000000000002", dueAt: "2099-01-01T00:00:00.000002Z" },
    ];
    await expect(setup({ ...queue, totalCards: 3, cards }).repository.getQueue(setId)).resolves.toEqual({
      ok: true,
      data: { ...queue, totalCards: 3, cards },
    });
  });

  it.each([0, 4])("preserves empty due queues with totalCards=%s", async (totalCards) => {
    const data = { ...queue, totalCards, cards: [] };
    await expect(setup(data).repository.getQueue(setId)).resolves.toEqual({ ok: true, data });
  });

  it.each([
    null,
    [],
    {},
    { ...queue, setId: cardId },
    { ...queue, title: " " },
    { ...queue, totalCards: -1 },
    { ...queue, totalCards: 1.5 },
    { ...queue, totalCards: 0 },
    { ...queue, cards: null },
    { ...queue, totalCards: 2, cards: [card, card] },
    ...[
      null,
      { ...card, id: "bad" },
      { ...card, answer: null },
      { ...card, question: "" },
      { ...card, revision: -1 },
      { ...card, revision: 0.5 },
      { ...card, dueAt: "not a date" },
      { ...card, dueAt: "2026-11-13" },
    ].map((badCard) => ({ ...queue, cards: [badCard] })),
  ])("rejects malformed queue responses %#", async (data) => {
    await expect(setup(data).repository.getQueue(setId)).resolves.toEqual({ ok: false, error: "request-failed" });
  });

  it.each(["dont_know", "hard", "know"] as const)("rates %s and preserves exact retries", async (rating) => {
    const data = { ...receipt, rating };
    const { repository, rpc } = setup(data);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(repository.rateCard(cardId, { ...input, rating })).resolves.toEqual({ ok: true, data });
    }
    expect(rpc.mock.calls).toEqual(
      Array.from({ length: 2 }, () => [
        "rate_flashcard",
        {
          card_id: cardId,
          request_id: requestId,
          expected_revision: 0,
          rating,
        },
      ]),
    );
  });

  it.each([
    null,
    [],
    {},
    { ...receipt, requestId: cardId },
    { ...receipt, cardId: setId },
    { ...receipt, rating: "know" },
    { ...receipt, expectedRevision: 1 },
    { ...receipt, revision: 0 },
    { ...receipt, ratedAt: "bad" },
    { ...receipt, dueAt: receipt.ratedAt },
    { ...receipt, dueAt: "2020-01-01T00:00:00Z" },
  ])("rejects malformed or mismatched success receipts %#", async (data) => {
    await expect(setup(data).repository.rateCard(cardId, input)).resolves.toEqual({
      ok: false,
      error: "request-failed",
    });
  });

  it.each([
    ["22023", "invalid-input"],
    ["42501", "unauthenticated"],
    ["P0002", "not-found"],
    ["P0001", "conflict"],
    ["XX000", "request-failed"],
    [undefined, "request-failed"],
  ])("maps SQLSTATE %s independently of message text", async (code, error) => {
    const { repository } = setup(null, { code, message: "P0002 secret details" });
    await expect(repository.getQueue(setId)).resolves.toEqual({ ok: false, error });
    await expect(repository.rateCard(cardId, input)).resolves.toEqual({ ok: false, error });
  });

  it("sanitizes transport rejections", async () => {
    const { repository, rpc } = setup();
    rpc.mockRejectedValue(new Error("secret"));
    await expect(repository.getQueue(setId)).resolves.toEqual({ ok: false, error: "request-failed" });
    await expect(repository.rateCard(cardId, input)).resolves.toEqual({ ok: false, error: "request-failed" });
  });

  it("rejects invalid identifiers and input before making RPC calls", async () => {
    const { repository, rpc } = setup();
    await expect(repository.getQueue("bad")).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(repository.rateCard("bad", input)).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(repository.rateCard(cardId, { ...input, expectedRevision: -1 })).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("review input", () => {
  it.each([
    null,
    [],
    {},
    { ...input, requestId: "bad" },
    { ...input, expectedRevision: -1 },
    { ...input, expectedRevision: 1.5 },
    { ...input, expectedRevision: "0" },
    { ...input, expectedRevision: 2147483648 },
    { ...input, expectedRevision: NaN },
    { ...input, rating: "good" },
    { ...input, ownerId: setId },
    { ...input, dueAt: "2099-01-01" },
  ])("rejects invalid or client-controlled fields %#", (value) => {
    expect(toReviewInput(value)).toBeNull();
  });
});
