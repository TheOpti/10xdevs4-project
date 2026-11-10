import { Badge } from "@/components/ui/badge";
import {
  MAX_SOURCE_TEXT_CODE_POINTS,
  MAX_TITLE_CODE_POINTS,
  validateFlashcardProposalInput,
  type FlashcardProposal,
} from "@/lib/flashcard-proposals";
import { reconcileSavedDraft, type ReviewSaveCard } from "@/lib/flashcard-save-reconciliation";
import { useState, type SubmitEvent } from "react";

function validationMessage(
  error: Exclude<ReturnType<typeof validateFlashcardProposalInput>, { valid: true }>["error"],
) {
  switch (error) {
    case "title-required":
      return "Enter a title for this set.";
    case "title-too-long":
      return `Set title must be ${MAX_TITLE_CODE_POINTS.toLocaleString()} characters or fewer.`;
    case "source-text-required":
      return "Paste source text to generate a proposal.";
    case "source-text-too-long":
      return `Source text must be ${MAX_SOURCE_TEXT_CODE_POINTS.toLocaleString()} characters or fewer.`;
  }
}

function formatQualityFlag(flag: string): string {
  switch (flag) {
    case "long-answer":
      return "Answer > 300 characters";
    case "identical-qa":
      return "Question and answer identical";
    case "duplicate-question":
      return "Duplicate question";
    case "duplicate-answer":
      return "Duplicate answer";
    default:
      return flag;
  }
}

function isProposal(value: unknown): value is FlashcardProposal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { question, answer, qualityFlags } = value as Record<string, unknown>;
  return typeof question === "string" && typeof answer === "string" && Array.isArray(qualityFlags);
}

interface ReviewRow extends FlashcardProposal {
  id: string;
}

function isGenerationResponse(value: unknown): value is { setId: string; proposals: FlashcardProposal[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { setId, proposals } = value as Record<string, unknown>;
  return (
    typeof setId === "string" &&
    Array.isArray(proposals) &&
    proposals.length >= 1 &&
    proposals.length <= 15 &&
    proposals.every(isProposal)
  );
}

function isSaveResponse(value: unknown): value is { setId: string; cards: ReviewSaveCard[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { setId, cards } = value as Record<string, unknown>;
  return (
    typeof setId === "string" &&
    Array.isArray(cards) &&
    cards.every(
      (card) =>
        typeof card === "object" &&
        card !== null &&
        typeof (card as Record<string, unknown>).question === "string" &&
        typeof (card as Record<string, unknown>).answer === "string",
    )
  );
}

export default function NewFlashcardsForm() {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [setId, setSetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewRow[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submittedCards, setSubmittedCards] = useState<ReviewSaveCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasSaveConflict, setHasSaveConflict] = useState(false);
  const sourceTextLength = Array.from(sourceText).length;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateFlashcardProposalInput({ title, sourceText });
    if (!validation.valid) {
      setError(validationMessage(validation.error));
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceText }),
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        if (
          typeof responseBody === "object" &&
          responseBody !== null &&
          "error" in responseBody &&
          typeof (responseBody as Record<string, unknown>).error === "string"
        ) {
          setError((responseBody as Record<string, unknown>).error as string);
        } else if (response.status === 422) {
          setError("The provided text does not contain enough factual information to generate flashcards.");
        } else if (response.status === 503) {
          setError("AI generation service unavailable. Please try again later.");
        } else {
          setError(
            "We could not confirm whether a proposal was created. Your text is still here. Check your sets before submitting again.",
          );
        }
        return;
      }

      if (!isGenerationResponse(responseBody)) {
        setError(
          "We could not confirm whether a proposal was created. Your text is still here. Check your sets before submitting again.",
        );
        return;
      }

      setSetId(responseBody.setId);
      setDraft(responseBody.proposals.map((proposal) => ({ ...proposal, id: crypto.randomUUID() })));
      setRequestId(null);
      setSubmittedCards(null);
      setHasSaveConflict(false);
      setIsComplete(false);
    } catch {
      setError(
        "We could not confirm whether a proposal was created. Your text is still here. Check your sets before submitting again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function updateDraftRow(id: string, field: "question" | "answer", value: string) {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    if (!hasSaveConflict) {
      setError(null);
    }
  }

  function deleteDraftRow(id: string) {
    setDraft((rows) => rows.filter((row) => row.id !== id));
    if (!hasSaveConflict) {
      setError(null);
    }
  }

  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!setId || draft.length === 0) {
      setError("Keep at least one flashcard before saving.");
      return;
    }

    const cards = draft.map(({ question, answer }) => ({ question, answer }));
    const savedDraft = submittedCards ?? cards;
    const saveRequestId = requestId ?? crypto.randomUUID();
    setRequestId(saveRequestId);
    setSubmittedCards(savedDraft);
    setIsSaving(true);
    try {
      const response = await fetch("/api/flashcards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId,
          requestId: saveRequestId,
          cards: savedDraft,
        }),
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok || !isSaveResponse(responseBody) || responseBody.setId !== setId) {
        setError("We could not confirm the save. Your draft is still here. Check the saved set before retrying.");
        return;
      }

      const reconciliation = reconcileSavedDraft(responseBody.cards, savedDraft, cards);
      if (reconciliation === "saved-data-changed") {
        setError("We could not confirm which flashcards were saved. Your draft is still available.");
        setHasSaveConflict(true);
        return;
      }

      if (reconciliation === "draft-changed") {
        setError(
          "Your original flashcards were saved, but later edits were not. Your draft is still here. Open the saved set to make corrections.",
        );
        setHasSaveConflict(true);
        return;
      }

      setDraft([]);
      setIsComplete(true);
    } catch {
      setError("We could not confirm the save. Your draft is still here. Check the saved set before retrying.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New set</h1>
        <p className="text-muted-foreground mt-1 text-sm">Paste text to receive flashcard proposals.</p>
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
          disabled={isGenerating || isSaving}
          className="bg-primary text-primary-foreground hover:bg-primary/80 h-9 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate flashcards"}
        </button>
      </form>

      {setId && !isComplete && (
        <form className="mt-10 space-y-4 rounded-xl border p-6" onSubmit={handleSave} noValidate>
          <div>
            <p className="text-primary text-sm font-medium">Review proposals</p>
            <h2 className="mt-2 text-lg font-medium">Edit or remove cards before saving</h2>
          </div>

          {draft.map((row, index) => (
            <fieldset key={row.id} disabled={isSaving || isGenerating} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="px-1 text-sm font-medium">Flashcard {index + 1}</legend>
                {row.qualityFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="quality-flags">
                    {row.qualityFlags.map((flag) => (
                      <Badge
                        key={flag}
                        variant="secondary"
                        className="border border-amber-200 bg-amber-50 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        ⚠️ {formatQualityFlag(flag)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor={`${row.id}-question`} className="text-sm font-medium">
                  Question
                </label>
                <input
                  id={`${row.id}-question`}
                  value={row.question}
                  onChange={(event) => {
                    updateDraftRow(row.id, "question", event.target.value);
                  }}
                  className="bg-background mt-1 h-10 w-full rounded-md border px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor={`${row.id}-answer`} className="text-sm font-medium">
                  Answer
                </label>
                <textarea
                  id={`${row.id}-answer`}
                  value={row.answer}
                  onChange={(event) => {
                    updateDraftRow(row.id, "answer", event.target.value);
                  }}
                  className="bg-background mt-1 min-h-24 w-full rounded-md border p-3 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteDraftRow(row.id);
                }}
                className="text-destructive text-sm font-medium hover:underline"
              >
                Delete flashcard {index + 1}
              </button>
            </fieldset>
          ))}

          <button
            type="submit"
            disabled={draft.length === 0 || isSaving || isGenerating || hasSaveConflict}
            className="bg-primary text-primary-foreground hover:bg-primary/80 h-9 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Accept all & save"}
          </button>
        </form>
      )}

      {setId && requestId && !isComplete && !isSaving && (
        <p className="mt-4 text-sm">
          <a
            className="text-primary hover:underline"
            href={`/dashboard/sets/${setId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check saved set
          </a>{" "}
          <span className="text-muted-foreground">(opens in a new tab; your draft stays here)</span>
        </p>
      )}

      {isComplete && setId && (
        <section className="mt-10 rounded-xl border p-6" aria-labelledby="save-complete-heading">
          <p className="text-primary text-sm font-medium">Saved</p>
          <h2 id="save-complete-heading" className="mt-2 text-lg font-medium">
            Your flashcards are ready.
          </h2>
          <div className="mt-5 flex gap-4 text-sm font-medium">
            <a className="text-primary hover:underline" href={`/dashboard/sets/${setId}`}>
              Open saved set
            </a>
            <a className="text-primary hover:underline" href="/dashboard">
              Go to dashboard
            </a>
            <a className="text-primary hover:underline" href="/dashboard/new">
              Create another set
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
