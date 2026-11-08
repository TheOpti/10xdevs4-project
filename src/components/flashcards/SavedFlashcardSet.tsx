import { useEffect, useReducer, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Flashcard } from "@/lib/flashcards";
import { toCard } from "@/lib/flashcard-validation";
import { cardEditorReducer, initialCardState, savedCardFromResponse } from "@/lib/saved-card-state";

function SavedCard({ card, index, onRemove }: { card: Flashcard; index: number; onRemove: () => void }) {
  const [state, dispatch] = useReducer(cardEditorReducer, card, initialCardState);
  const requestPending = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const { draft, mode, pending, missing, message } = state;

  useEffect(() => {
    if (mode === "edit") questionInput.current?.focus();
    if (mode === "delete") confirmButton.current?.focus();
  }, [mode]);

  function cancel() {
    dispatch({ type: "cancel" });
    requestAnimationFrame(() => (mode === "edit" ? editButton : deleteButton).current?.focus());
  }

  async function mutate(method: "PATCH" | "DELETE") {
    if (requestPending.current) return;
    const input = method === "PATCH" ? toCard(draft) : null;
    if (method === "PATCH" && !input) {
      dispatch({ type: "failed", message: "Enter a question and answer, each containing 1–1000 characters." });
      return;
    }
    requestPending.current = true;
    dispatch({ type: "pending" });
    try {
      const response = await fetch(`/api/flashcards/cards/${card.id}`, {
        method,
        ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
      });
      if (response.status === 404) {
        dispatch({
          type: "failed",
          missing: true,
          message:
            method === "PATCH"
              ? "This card is no longer available. Your draft is kept here so you can copy it before refreshing."
              : "This card is no longer available. You can remove this outdated row from the view.",
        });
        return;
      }
      if (method === "DELETE" && response.status === 204) {
        onRemove();
        return;
      }
      if (method === "PATCH" && response.ok) {
        const saved = savedCardFromResponse(await response.json(), card.id);
        if (saved) {
          dispatch({ type: "saved", card: saved });
          requestAnimationFrame(() => editButton.current?.focus());
          return;
        }
      }
      dispatch({
        type: "failed",
        message:
          "We could not confirm the change. Your content is still here. Retry or refresh to check the saved version.",
      });
    } catch {
      dispatch({
        type: "failed",
        message:
          "We could not confirm the change. Your content is still here. Retry or refresh to check the saved version.",
      });
    } finally {
      requestPending.current = false;
    }
  }

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("PATCH");
  }

  return (
    <Card>
      <CardContent>
        <h2 className="text-muted-foreground text-sm font-medium">Flashcard {index + 1}</h2>
        {mode === "edit" ? (
          <form onSubmit={save} noValidate aria-busy={pending} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              <legend className="sr-only">Edit flashcard {index + 1}</legend>
              {(["question", "answer"] as const).map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`${card.id}-${field}`}>{field === "question" ? "Question" : "Answer"}</Label>
                  <Textarea
                    ref={field === "question" ? questionInput : undefined}
                    id={`${card.id}-${field}`}
                    value={draft[field]}
                    required
                    onChange={(event) => {
                      dispatch({ type: "draft", field, value: event.target.value });
                    }}
                    aria-describedby={`${card.id}-limits`}
                  />
                </div>
              ))}
              <p id={`${card.id}-limits`} className="text-muted-foreground text-xs">
                Each field must contain 1–1000 characters.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={missing}>
                  {pending ? "Saving..." : message ? "Retry save" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        ) : (
          <>
            <p className="font-medium wrap-anywhere whitespace-pre-wrap">{state.card.question}</p>
            <p className="text-muted-foreground wrap-anywhere whitespace-pre-wrap">{state.card.answer}</p>
            {mode === "delete" ? (
              <div className="space-y-3" aria-busy={pending}>
                <p>Delete this flashcard permanently? This cannot be undone.</p>
                <div className="flex flex-wrap gap-2">
                  {missing ? (
                    <Button type="button" variant="destructive" onClick={onRemove}>
                      Remove from view
                    </Button>
                  ) : (
                    <Button
                      ref={confirmButton}
                      type="button"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => void mutate("DELETE")}
                    >
                      {pending ? "Deleting..." : message ? "Retry delete" : "Confirm deletion"}
                    </Button>
                  )}
                  <Button type="button" variant="outline" disabled={pending} onClick={cancel}>
                    Cancel deletion
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={editButton}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    dispatch({ type: "edit" });
                  }}
                >
                  Edit
                </Button>
                <Button
                  ref={deleteButton}
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    dispatch({ type: "delete" });
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
        <div role="status" aria-live="polite" className="text-sm">
          {message && <p>{message}</p>}
        </div>
        {message && mode !== "preview" && !pending && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Refreshing discards unsaved drafts in this set.</p>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                window.location.reload();
              }}
            >
              Refresh saved set
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SavedFlashcardSet({ title, cards: initialCards }: { title: string; cards: Flashcard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold tracking-tight wrap-anywhere">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Save each card explicitly. Leaving or refreshing discards unsaved drafts.
        </p>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {notice}
      </p>
      {cards.length === 0 ? (
        <Card>
          <CardContent>
            <h2 className="text-lg font-medium">No cards in this set</h2>
            <p className="text-muted-foreground">Your set is still available.</p>
          </CardContent>
        </Card>
      ) : (
        cards.map((card, index) => (
          <SavedCard
            key={card.id}
            card={card}
            index={index}
            onRemove={() => {
              setCards((current) => current.filter((item) => item.id !== card.id));
              setNotice("Card removed from this view.");
              heading.current?.focus();
            }}
          />
        ))
      )}
    </div>
  );
}
