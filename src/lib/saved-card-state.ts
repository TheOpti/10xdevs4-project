import type { Flashcard, FlashcardInput } from "@/lib/flashcards";

export interface CardEditorState {
  card: Flashcard;
  draft: FlashcardInput;
  mode: "preview" | "edit" | "delete";
  pending: boolean;
  missing: boolean;
  message: string | null;
}

export function initialCardState(card: Flashcard): CardEditorState {
  return {
    card,
    draft: { question: card.question, answer: card.answer },
    mode: "preview",
    pending: false,
    missing: false,
    message: null,
  };
}

type Action =
  | { type: "edit" | "delete" | "cancel" | "pending" }
  | { type: "draft"; field: keyof FlashcardInput; value: string }
  | { type: "saved"; card: Flashcard }
  | { type: "failed"; message: string; missing?: boolean };

export function cardEditorReducer(state: CardEditorState, action: Action): CardEditorState {
  if (state.pending && action.type !== "saved" && action.type !== "failed") return state;
  switch (action.type) {
    case "edit":
    case "delete":
      return { ...state, mode: action.type, message: null };
    case "cancel":
      return initialCardState(state.card);
    case "draft":
      return { ...state, draft: { ...state.draft, [action.field]: action.value } };
    case "pending":
      return { ...state, pending: true, message: null };
    case "saved":
      return { ...initialCardState(action.card), message: "Card saved." };
    case "failed":
      return { ...state, pending: false, missing: action.missing ?? false, message: action.message };
  }
}

export function savedCardFromResponse(value: unknown, id: string): Flashcard | null {
  if (typeof value !== "object" || value === null || !("card" in value)) return null;
  const card: unknown = value.card;
  if (typeof card !== "object" || card === null) return null;
  const candidate = card as Record<string, unknown>;
  return candidate.id === id &&
    typeof candidate.question === "string" &&
    typeof candidate.answer === "string" &&
    typeof candidate.createdAt === "string"
    ? { id, question: candidate.question, answer: candidate.answer, createdAt: candidate.createdAt }
    : null;
}
