import { useState, type SubmitEvent } from "react";
import {
  MAX_TITLE_CODE_POINTS,
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
    case "title-too-long":
      return `Set title must be ${MAX_TITLE_CODE_POINTS.toLocaleString()} characters or fewer.`;
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

interface ReviewRow extends FlashcardProposal {
  id: string;
}

function isGenerationResponse(value: unknown): value is { setId: string; proposals: FlashcardProposal[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { setId, proposals } = value as Record<string, unknown>;
  return typeof setId === "string" && Array.isArray(proposals) && proposals.length === 3 && proposals.every(isProposal);
}

export default function NewFlashcardsForm() {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [setId, setSetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewRow[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
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

      if (!response.ok || !isGenerationResponse(responseBody)) {
        setError(
          "We could not confirm whether a proposal was created. Your text is still here. Check your sets before submitting again.",
        );
        return;
      }

      setSetId(responseBody.setId);
      setDraft(responseBody.proposals.map((proposal) => ({ ...proposal, id: crypto.randomUUID() })));
      setRequestId(null);
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
    setError(null);
  }

  function deleteDraftRow(id: string) {
    setDraft((rows) => rows.filter((row) => row.id !== id));
    setError(null);
  }

  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!setId || draft.length === 0) {
      setError("Keep at least one flashcard before saving.");
      return;
    }

    const saveRequestId = requestId ?? crypto.randomUUID();
    setRequestId(saveRequestId);
    setIsSaving(true);
    try {
      const response = await fetch("/api/flashcards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId,
          requestId: saveRequestId,
          cards: draft.map(({ question, answer }) => ({ question, answer })),
        }),
      });

      if (!response.ok) {
        setError("We could not save these flashcards. You can edit the draft and retry.");
        return;
      }

      setDraft([]);
      setSetId(null);
      setIsComplete(true);
    } catch {
      setError("We could not save these flashcards. You can edit the draft and retry.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New set</h1>
        <p className="text-muted-foreground mt-1 text-sm">Paste text to receive demo flashcard proposals.</p>
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
          disabled={isGenerating}
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
            <fieldset key={row.id} className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">Flashcard {index + 1}</legend>
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
            disabled={draft.length === 0 || isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/80 h-9 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Accept all & save"}
          </button>
        </form>
      )}

      {isComplete && (
        <section className="mt-10 rounded-xl border p-6" aria-labelledby="save-complete-heading">
          <p className="text-primary text-sm font-medium">Saved</p>
          <h2 id="save-complete-heading" className="mt-2 text-lg font-medium">
            Your flashcards are ready.
          </h2>
          <div className="mt-5 flex gap-4 text-sm font-medium">
            <a className="text-primary hover:underline" href="/dashboard">
              Go to dashboard
            </a>
            <a className="text-primary hover:underline" href="/flashcards/new">
              Create another set
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
