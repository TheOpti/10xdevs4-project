import type { APIRoute } from "astro";
import { generateDemoFlashcardProposal, validateFlashcardProposalInput } from "@/lib/flashcard-proposals";
import { createFlashcardRepository } from "@/lib/flashcards";
import { createClient } from "@/lib/supabase";

const MAX_REQUEST_BODY_BYTES = 48 * 1024;

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

class RequestBodyTooLargeError extends Error {}

async function parseJsonRequestBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BODY_BYTES)) {
    throw new RequestBodyTooLargeError();
  }

  const body = request.body;
  if (body === null) {
    throw new SyntaxError("Request body is required");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}

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
