import type { APIRoute } from "astro";
import { GEMINI_API_KEY, GEMINI_MODEL } from "astro:env/server";
import { computeQualityFlags, type FlashcardProposal, validateFlashcardProposalInput } from "@/lib/flashcard-proposals";
import { createFlashcardRepository } from "@/lib/flashcards";
import { generateProposalsWithGemini } from "@/lib/gemini";
import { parseJsonRequestBody } from "@/lib/request-body";
import { createClient } from "@/lib/supabase";

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

function isProposalInput(value: unknown): value is { title: string; sourceText: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { title, sourceText } = value as Record<string, unknown>;
  return typeof title === "string" && typeof sourceText === "string";
}

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await parseJsonRequestBody(context.request);
  } catch {
    return jsonError("Invalid request", 400);
  }

  if (!isProposalInput(body)) {
    return jsonError("Invalid request", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Service unavailable", 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("Authentication required", 401);
  }

  if (!validateFlashcardProposalInput(body).valid) {
    return jsonError("Invalid request", 400);
  }

  if (!GEMINI_API_KEY) {
    return jsonError("AI generation service unavailable", 503);
  }

  const generationResult = await generateProposalsWithGemini({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    sourceText: body.sourceText,
    signal: context.request.signal,
  });

  if (!generationResult.ok) {
    if (generationResult.error === "insufficient-content") {
      return jsonError("The provided text does not contain enough factual information to generate flashcards.", 422);
    }
    if (generationResult.error === "rate-limited" || generationResult.error === "service-error") {
      return jsonError("AI generation service unavailable", 503);
    }
    return jsonError("Failed to generate flashcards", 500);
  }

  if (generationResult.proposals.length === 0) {
    return jsonError("The provided text does not contain enough factual information to generate flashcards.", 422);
  }

  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) {
    return jsonError("Service unavailable", 503);
  }

  const result = await repository.createSet(body);
  if (!result.ok) {
    return jsonError("Unable to create flashcard set", 500);
  }

  const proposals: FlashcardProposal[] = generationResult.proposals.map((proposal, index) => {
    const otherProposals = generationResult.proposals.filter((_, idx) => idx !== index);
    return {
      question: proposal.question,
      answer: proposal.answer,
      qualityFlags: computeQualityFlags(proposal.question, proposal.answer, otherProposals),
    };
  });

  return Response.json(
    {
      setId: result.data.id,
      proposals,
    },
    { status: 201 },
  );
};
