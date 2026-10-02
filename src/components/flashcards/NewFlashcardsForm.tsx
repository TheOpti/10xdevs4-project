import { useState, type SubmitEvent } from "react";
import {
  MAX_SOURCE_TEXT_CODE_POINTS,
  type FlashcardProposal,
  validateFlashcardProposalInput,
} from "@/lib/flashcard-proposals";

function validationMessage(
  error: Exclude<ReturnType<typeof validateFlashcardProposalInput>, { valid: true }>["error"],
) {
  switch (error) {
    case "title-required":
      return "Enter a title for this set.";
    case "source-text-required":
      return "Paste source text to generate a proposal.";
    case "source-text-too-long":
      return `Source text must be ${MAX_SOURCE_TEXT_CODE_POINTS.toLocaleString()} characters or fewer.`;
  }
}

function isProposal(value: unknown): value is FlashcardProposal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { question, answer, isDemo, qualityFlags } = value as Record<string, unknown>;
  return typeof question === "string" && typeof answer === "string" && isDemo === true && Array.isArray(qualityFlags);
}

export default function NewFlashcardsForm() {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [proposal, setProposal] = useState<FlashcardProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const sourceTextLength = Array.from(sourceText).length;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProposal(null);

    const validation = validateFlashcardProposalInput({ title, sourceText });
    if (!validation.valid) {
      setError(validationMessage(validation.error));
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceText }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      const responsePayload = responseBody as Record<string, unknown> | null;

      if (!response.ok || responsePayload === null || !isProposal(responsePayload.proposal)) {
        setError("We could not generate a proposal. Your text is still here, so you can try again.");
        return;
      }

      setProposal(responsePayload.proposal);
    } catch {
      setError("We could not generate a proposal. Your text is still here, so you can try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New set</h1>
        <p className="text-muted-foreground mt-1 text-sm">Paste text to receive a demo flashcard proposal.</p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="set-title" className="text-sm font-medium">
            Set title
          </label>
          <input
            id="set-title"
            name="title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            required
            className="bg-background mt-2 h-10 w-full rounded-md border px-3 text-sm"
          />
        </div>

        <div>
          <label htmlFor="source-text" className="text-sm font-medium">
            Source text
          </label>
          <textarea
            id="source-text"
            name="sourceText"
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
            }}
            required
            className="bg-background mt-2 min-h-64 w-full rounded-md border p-3 text-sm"
          />
          <p className="text-muted-foreground mt-2 text-xs">
            {sourceTextLength.toLocaleString()} / {MAX_SOURCE_TEXT_CODE_POINTS.toLocaleString()} characters
          </p>
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/80 h-9 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate flashcards"}
        </button>
      </form>

      {proposal && (
        <section className="mt-10 rounded-xl border p-6" aria-labelledby="demo-proposal-heading">
          <p className="text-primary text-sm font-medium">Demo proposal</p>
          <h2 id="demo-proposal-heading" className="mt-3 text-lg font-medium">
            {proposal.question}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">{proposal.answer}</p>
          <p className="text-muted-foreground mt-5 text-sm">
            Review and saving controls will arrive in S-02. This demo proposal is not saved.
          </p>
        </section>
      )}
    </div>
  );
}
