import { useReducer, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { initialTagState, tagEditorReducer, tagsFromResponse } from "@/lib/tag-editor-state";

export default function SetTagEditor({ setId, initialTags }: { setId: string; initialTags: string[] }) {
  const [state, dispatch] = useReducer(tagEditorReducer, initialTags, initialTagState);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestPending = useRef(false);

  const { draftTags, input, pending, missing, message } = state;

  async function save() {
    if (requestPending.current || pending || missing) return;
    if (input.trim().length > 0) {
      dispatch({ type: "failed", message: "Use Add tag before saving, or clear the tag name." });
      inputRef.current?.focus();
      return;
    }
    requestPending.current = true;
    dispatch({ type: "pending" });
    try {
      const response = await fetch(`/api/flashcards/sets/${setId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: draftTags }),
      });

      if (response.status === 404) {
        dispatch({
          type: "failed",
          missing: true,
          message: "This set is no longer available. Your tag draft is kept here so you can copy it before leaving.",
        });
        return;
      }

      if (response.ok) {
        const data: unknown = await response.json();
        const saved = tagsFromResponse(data);
        if (saved) {
          dispatch({ type: "saved", tags: saved });
          return;
        }
      }

      dispatch({
        type: "failed",
        message: "We could not save your tags. Your changes are kept here. Try saving again.",
      });
    } catch {
      dispatch({
        type: "failed",
        message: "We could not save your tags. Your changes are kept here. Try saving again.",
      });
    } finally {
      requestPending.current = false;
    }
  }

  function handleAdd(event?: React.SyntheticEvent) {
    if (event) event.preventDefault();
    dispatch({ type: "add" });
    inputRef.current?.focus();
  }

  const isErrorMessage = Boolean(message && !message.includes("saved"));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id={`tags-heading-${setId}`} className="text-lg font-medium">
              Tags
            </h2>
            <p className="text-muted-foreground text-xs">
              Organize this set with up to 10 tags. Spaces and punctuation are allowed.
            </p>
          </div>
          <span className="text-muted-foreground text-xs">{draftTags.length} / 10 tags</span>
        </div>

        {draftTags.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Current tags">
            {draftTags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
                  <span>{tag}</span>
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    disabled={pending || missing}
                    onClick={() => {
                      dispatch({ type: "remove", tag });
                    }}
                    className="hover:bg-muted-foreground/20 rounded p-0.5 transition-colors focus:outline-none focus-visible:ring-1"
                  >
                    <X className="size-3.5" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No tags added to this set yet.</p>
        )}

        <form onSubmit={handleAdd} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`tag-input-${setId}`}>Tag name</Label>
            <div className="flex max-w-md gap-2">
              <Input
                ref={inputRef}
                id={`tag-input-${setId}`}
                type="text"
                placeholder="e.g. biology, exam 1"
                value={input}
                disabled={pending || missing || draftTags.length >= 10}
                onChange={(e) => {
                  dispatch({ type: "input", value: e.target.value });
                }}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={pending || missing || draftTags.length >= 10 || input.trim().length === 0}
              >
                Add tag
              </Button>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" onClick={() => void save()} disabled={pending || missing}>
            {pending ? "Saving tags..." : isErrorMessage ? "Retry save" : "Save tags"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-label="Cancel tag changes"
            onClick={() => {
              dispatch({ type: "cancel" });
            }}
          >
            Cancel
          </Button>
        </div>

        <div role="status" aria-live="polite" className="text-sm">
          {message && (
            <p className={isErrorMessage ? "text-destructive" : "text-green-600 dark:text-green-400"}>{message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
