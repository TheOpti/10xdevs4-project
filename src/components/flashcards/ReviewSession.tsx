import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewQueue, ReviewRating } from "@/lib/flashcard-reviews";
import {
  initialReviewState,
  reviewSessionReducer,
  type ReviewAction,
  type ReviewOperation,
} from "@/lib/review-session-state";

const ratings: { value: ReviewRating; label: string }[] = [
  { value: "dont_know", label: "Don't know — 24 hours" },
  { value: "hard", label: "Hard — 72 hours" },
  { value: "know", label: "Know — 168 hours" },
];

export default function ReviewSession({ queue, backHref }: { queue: ReviewQueue; backHref: string }) {
  const [state, setState] = useState(() => initialReviewState(queue.cards));
  const current = useRef(state);
  const question = useRef<HTMLHeadingElement>(null);
  const recovery = useRef<HTMLParagraphElement>(null);
  const firstRating = useRef<HTMLButtonElement>(null);
  const pending = state.status === "pending";
  const blocked = state.status !== "ready" && !pending;
  const card = state.cards.at(state.index);
  const finished = queue.cards.length > 0 && !card;

  // Update the ref before React renders so a second click cannot start another operation.
  function transition(action: ReviewAction) {
    const next = reviewSessionReducer(current.current, action);
    current.current = next;
    setState(next);
    return next;
  }

  useEffect(() => {
    if (blocked) recovery.current?.focus();
    else if (!pending) question.current?.focus();
  }, [state.index, state.status, blocked, pending]);

  async function send(operation: ReviewOperation) {
    try {
      const { cardId, ...input } = operation;
      const response = await fetch(`/api/flashcards/cards/${cardId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body: unknown = response.status === 200 ? await response.json() : undefined;
      transition({ type: "response", requestId: operation.requestId, status: response.status, body });
    } catch {
      transition({ type: "response", requestId: operation.requestId, status: 0 });
    }
  }

  function rate(rating: ReviewRating) {
    if (current.current.status !== "ready" || !current.current.revealed) return;
    const next = transition({ type: "rate", rating, requestId: crypto.randomUUID() });
    if (next.status === "pending" && next.operation) void send(next.operation);
  }

  function retry() {
    if (current.current.status !== "uncertain") return;
    const next = transition({ type: "retry" });
    if (next.operation) void send(next.operation);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-semibold wrap-anywhere">{queue.title}</h1>
        {pending ? (
          <Button variant="outline" disabled>
            Exit review
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <a href={backHref}>Exit review</a>
          </Button>
        )}
      </header>
      {queue.cards.length === 0 ? (
        <Card>
          <CardContent>
            <h2 className="text-xl font-semibold">
              {queue.totalCards === 0 ? "No cards in this set" : "No cards due"}
            </h2>
            <p className="text-muted-foreground">
              {queue.totalCards === 0
                ? "Add cards to this set before starting a review."
                : "There are no cards available for review right now. Come back later."}
            </p>
            <Button asChild>
              <a href={backHref}>Back to set</a>
            </Button>
          </CardContent>
        </Card>
      ) : finished ? (
        <Card>
          <CardContent>
            <h2
              ref={question}
              tabIndex={-1}
              className="focus-visible:ring-ring text-xl font-semibold focus-visible:ring-2"
            >
              Review finished
            </h2>
            <p>You reached the end of this review session.</p>
            <p>Saved: {state.saved}</p>
            <p>Skipped: {state.skipped}</p>
            <Button asChild>
              <a href={backHref}>Back to set</a>
            </Button>
          </CardContent>
        </Card>
      ) : card ? (
        <>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Card {state.index + 1} of {state.cards.length} · Saved: {state.saved} · Skipped: {state.skipped}
            </p>
            <progress
              aria-label="Review progress"
              value={state.index}
              max={state.cards.length}
              className="accent-primary h-2 w-full"
            />
          </div>
          <Card>
            <CardContent className="gap-6">
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">Question</p>
                <h2
                  ref={question}
                  tabIndex={-1}
                  className="focus-visible:ring-ring rounded-sm text-xl font-medium wrap-anywhere whitespace-pre-wrap focus-visible:ring-2"
                >
                  {card.question}
                </h2>
              </div>
              {state.revealed ? (
                <>
                  <div className="border-border space-y-2 border-t pt-6">
                    <h3 className="text-muted-foreground text-sm">Answer</h3>
                    <p className="text-lg wrap-anywhere whitespace-pre-wrap">{card.answer}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3" aria-busy={pending}>
                    {ratings.map((rating, index) => (
                      <Button
                        key={rating.value}
                        ref={index === 0 ? firstRating : undefined}
                        variant="outline"
                        disabled={state.status !== "ready"}
                        onClick={() => {
                          rate(rating.value);
                        }}
                      >
                        {rating.label}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => {
                    transition({ type: "reveal" });
                    requestAnimationFrame(() => firstRating.current?.focus());
                  }}
                >
                  Show answer
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
      <p
        ref={recovery}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="focus-visible:ring-ring rounded-sm text-sm focus-visible:ring-2"
      >
        {state.message}
      </p>
      {blocked && (
        <div className="flex flex-wrap gap-3">
          {state.status === "uncertain" && <Button onClick={retry}>Retry rating</Button>}
          {state.status === "unauthenticated" ? (
            <Button asChild>
              <a href="/auth/signin">Sign in</a>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload reviews
            </Button>
          )}
        </div>
      )}
      {pending && (
        <p className="text-muted-foreground text-sm">
          Wait for confirmation before leaving. Closing or going back in your browser may interrupt confirmation.
        </p>
      )}
    </main>
  );
}
