import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlashcardRepository } from "@/lib/flashcards";
import { createClient } from "@/lib/supabase";
import { POST } from "./save";

vi.mock("@/lib/flashcards", () => ({ createFlashcardRepository: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateFlashcardRepository = vi.mocked(createFlashcardRepository);
const cookies = {} as AstroCookies;
const setId = "123e4567-e89b-42d3-a456-426614174000";
const requestId = "123e4567-e89b-42d3-a456-426614174001";

function createContext(body: string, headers?: HeadersInit) {
  return {
    request: new Request("http://localhost/api/flashcards/save", { method: "POST", body, headers }),
    cookies,
  } as Parameters<typeof POST>[0];
}

function configuredSupabase(user: object | null = { id: "user-id" }) {
  mockedCreateClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as never);
}

function validPayload() {
  return {
    setId,
    requestId,
    cards: [{ question: " What is a cell? ", answer: " The smallest unit of life. " }],
  };
}

describe("POST /api/flashcards/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a normalized batch and reports a first persistence", async () => {
    configuredSupabase();
    const saveCards = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        setId,
        created: true,
        cards: [
          {
            id: "card-id",
            question: "What is a cell?",
            answer: "The smallest unit of life.",
            createdAt: "2026-10-04T12:00:00.000Z",
          },
        ],
      },
    });
    mockedCreateFlashcardRepository.mockReturnValue({ saveCards } as never);

    const response = await POST(createContext(JSON.stringify(validPayload())));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      setId,
      cards: [
        {
          id: "card-id",
          question: "What is a cell?",
          answer: "The smallest unit of life.",
          createdAt: "2026-10-04T12:00:00.000Z",
        },
      ],
    });
    expect(saveCards).toHaveBeenCalledWith({
      setId,
      requestId,
      cards: [{ question: "What is a cell?", answer: "The smallest unit of life." }],
    });
  });

  it("returns 200 for an idempotent replay", async () => {
    configuredSupabase();
    mockedCreateFlashcardRepository.mockReturnValue({
      saveCards: vi.fn().mockResolvedValue({ ok: true, data: { setId, cards: [], created: false } }),
    } as never);

    const response = await POST(createContext(JSON.stringify(validPayload())));

    expect(response.status).toBe(200);
  });

  it("rejects malformed, oversized, and invalid batches before writing", async () => {
    configuredSupabase();
    const malformed = await POST(createContext("not json"));
    const oversized = await POST(createContext("{}", { "content-length": String(48 * 1024 + 1) }));
    const invalidBatch = await POST(
      createContext(
        JSON.stringify({ ...validPayload(), cards: Array.from({ length: 16 }, () => validPayload().cards[0]) }),
      ),
    );

    for (const response of [malformed, oversized, invalidBatch]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request" });
    }
    expect(mockedCreateFlashcardRepository).not.toHaveBeenCalled();
  });

  it("returns safe responses for unauthenticated, unavailable, and failed saves", async () => {
    configuredSupabase(null);
    const unauthenticated = await POST(createContext(JSON.stringify(validPayload())));

    mockedCreateClient.mockReturnValue(null);
    const unavailable = await POST(createContext(JSON.stringify(validPayload())));

    configuredSupabase();
    mockedCreateFlashcardRepository.mockReturnValue({
      saveCards: vi.fn().mockResolvedValue({ ok: false, error: "request-failed" }),
    } as never);
    const failedSave = await POST(createContext(JSON.stringify(validPayload())));

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Authentication required" });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: "Service unavailable" });
    expect(failedSave.status).toBe(500);
    await expect(failedSave.json()).resolves.toEqual({ error: "Unable to save flashcards" });
  });
});
