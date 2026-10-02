import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlashcardRepository } from "@/lib/flashcards";
import { createClient } from "@/lib/supabase";
import { POST } from "./generate";

vi.mock("@/lib/flashcards", () => ({ createFlashcardRepository: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateFlashcardRepository = vi.mocked(createFlashcardRepository);
const cookies = {} as AstroCookies;

function createContext(body: string) {
  return {
    request: new Request("http://localhost/api/flashcards/generate", { method: "POST", body }),
    cookies,
  } as Parameters<typeof POST>[0];
}

function configuredSupabase(user: object | null = { id: "user-id" }) {
  mockedCreateClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as never);
}

describe("POST /api/flashcards/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the private set before returning the demo proposal", async () => {
    configuredSupabase();
    const sourceText = "Private cell-biology notes.";
    const createSet = vi.fn().mockResolvedValue({ ok: true, data: { id: "set-id" } });
    mockedCreateFlashcardRepository.mockReturnValue({ createSet } as never);

    const response = await POST(createContext(JSON.stringify({ title: "Biology", sourceText })));

    expect(response.status).toBe(201);
    const payload: unknown = await response.json();
    expect(payload).toEqual({
      setId: "set-id",
      proposal: {
        question: "What is a flashcard?",
        answer: "A small prompt-and-answer study aid used for active recall.",
        isDemo: true,
        qualityFlags: [],
      },
    });
    expect(JSON.stringify(payload)).not.toContain(sourceText);
    expect(createSet).toHaveBeenCalledWith({ title: "Biology", sourceText });
  });

  it("returns a safe bad-request response for invalid JSON and invalid input", async () => {
    configuredSupabase();

    const invalidJson = await POST(createContext("not json"));
    const invalidInput = await POST(createContext(JSON.stringify({ title: " ", sourceText: "Cells." })));

    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toEqual({ error: "Invalid request" });
    expect(invalidInput.status).toBe(400);
    await expect(invalidInput.json()).resolves.toEqual({ error: "Invalid request" });
    expect(mockedCreateFlashcardRepository).not.toHaveBeenCalled();
  });

  it("returns safe responses for unauthenticated, unavailable, and failed requests", async () => {
    const sourceText = "Private source text that must never appear in a response.";
    configuredSupabase(null);
    const unauthenticated = await POST(createContext(JSON.stringify({ title: "Biology", sourceText })));

    mockedCreateClient.mockReturnValue(null);
    const unavailable = await POST(createContext(JSON.stringify({ title: "Biology", sourceText })));

    configuredSupabase();
    mockedCreateFlashcardRepository.mockReturnValue({
      createSet: vi.fn().mockResolvedValue({ ok: false, error: "request-failed" }),
    } as never);
    const failedWrite = await POST(createContext(JSON.stringify({ title: "Biology", sourceText })));

    expect(unauthenticated.status).toBe(401);
    const unauthenticatedPayload: unknown = await unauthenticated.json();
    expect(unauthenticatedPayload).toEqual({ error: "Authentication required" });
    expect(unavailable.status).toBe(503);
    const unavailablePayload: unknown = await unavailable.json();
    expect(unavailablePayload).toEqual({ error: "Service unavailable" });
    expect(failedWrite.status).toBe(500);
    const failedWritePayload: unknown = await failedWrite.json();
    expect(failedWritePayload).toEqual({ error: "Unable to create flashcard set" });
    expect(JSON.stringify([unauthenticatedPayload, unavailablePayload, failedWritePayload])).not.toContain(sourceText);
  });
});
