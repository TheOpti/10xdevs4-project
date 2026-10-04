import type { APIRoute } from "astro";
import { generateDemoFlashcardProposal, validateFlashcardProposalInput } from "@/lib/flashcard-proposals";
import { createFlashcardRepository } from "@/lib/flashcards";
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

  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) {
    return jsonError("Service unavailable", 503);
  }

  const result = await repository.createSet(body);
  if (!result.ok) {
    return jsonError("Unable to create flashcard set", 500);
  }

  return Response.json(
    {
      setId: result.data.id,
      proposal: generateDemoFlashcardProposal(),
    },
    { status: 201 },
  );
};
