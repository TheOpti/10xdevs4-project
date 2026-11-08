import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

export interface FlashcardSetSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface FlashcardSetWithCards extends FlashcardSetSummary {
  cards: Flashcard[];
}

export interface CreateFlashcardSetInput {
  title: string;
  sourceText: string;
}

export interface FlashcardInput {
  question: string;
  answer: string;
}

export interface CreatedFlashcardSet {
  id: string;
}

export interface SaveFlashcardsInput {
  setId: string;
  requestId: string;
  cards: FlashcardInput[];
}

export interface SavedFlashcards {
  setId: string;
  cards: Flashcard[];
  created: boolean;
}

export type FlashcardRepositoryError = "invalid-input" | "not-found" | "request-failed";

export type FlashcardRepositoryResult<T> = { ok: true; data: T } | { ok: false; error: FlashcardRepositoryError };

export interface FlashcardRepository {
  createSet(input: CreateFlashcardSetInput): Promise<FlashcardRepositoryResult<CreatedFlashcardSet>>;
  saveCards(input: SaveFlashcardsInput): Promise<FlashcardRepositoryResult<SavedFlashcards>>;
  listSets(): Promise<FlashcardRepositoryResult<FlashcardSetSummary[]>>;
  getSetWithCards(setId: string): Promise<FlashcardRepositoryResult<FlashcardSetWithCards>>;
  addCard(setId: string, input: FlashcardInput): Promise<FlashcardRepositoryResult<Flashcard>>;
  updateCard(cardId: string, input: FlashcardInput): Promise<FlashcardRepositoryResult<Flashcard>>;
  deleteCard(cardId: string): Promise<FlashcardRepositoryResult<void>>;
  deleteSet(setId: string): Promise<FlashcardRepositoryResult<void>>;
}

interface FlashcardSetRow {
  id: string;
  title: string;
  created_at: string;
}

interface FlashcardRow {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

interface SavedFlashcardRow extends FlashcardRow {
  was_created: boolean;
}

interface FlashcardSetWithCardsRow extends FlashcardSetRow {
  flashcards: FlashcardRow[] | null;
}

const requestFailed = <T>(): FlashcardRepositoryResult<T> => ({ ok: false, error: "request-failed" });
const notFound = <T>(): FlashcardRepositoryResult<T> => ({ ok: false, error: "not-found" });
const invalidInput = <T>(): FlashcardRepositoryResult<T> => ({ ok: false, error: "invalid-input" });

function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

function toSetSummary(row: FlashcardSetRow): FlashcardSetSummary {
  return { id: row.id, title: row.title, createdAt: row.created_at };
}

function toFlashcard(row: FlashcardRow): Flashcard {
  return { id: row.id, question: row.question, answer: row.answer, createdAt: row.created_at };
}

export function createFlashcardRepository(requestHeaders: Headers, cookies: AstroCookies): FlashcardRepository | null {
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return null;
  }

  return {
    async createSet(input) {
      if (!isNonEmpty(input.title) || !isNonEmpty(input.sourceText)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .rpc("create_flashcard_set_with_source", {
          set_title: input.title,
          set_source_text: input.sourceText,
        })
        .single()
        .overrideTypes<string, { merge: false }>();

      if (error || !data) {
        return requestFailed();
      }

      return { ok: true, data: { id: data } };
    },

    async saveCards(input) {
      if (
        !isNonEmpty(input.setId) ||
        !isNonEmpty(input.requestId) ||
        input.cards.length === 0 ||
        input.cards.some((card) => !isNonEmpty(card.question) || !isNonEmpty(card.answer))
      ) {
        return invalidInput();
      }

      const response = (await supabase.rpc("save_reviewed_flashcards", {
        set_id: input.setId,
        request_id: input.requestId,
        cards: input.cards,
      })) as { data: unknown; error: unknown };
      const savedCards = response.data as SavedFlashcardRow[] | null;

      if (response.error || !savedCards || savedCards.length === 0) {
        return requestFailed();
      }

      return {
        ok: true,
        data: {
          setId: input.setId,
          cards: savedCards.map(toFlashcard),
          created: savedCards[0].was_created,
        },
      };
    },

    async listSets() {
      const { data, error } = await supabase
        .from("flashcard_sets")
        .select("id, title, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .overrideTypes<FlashcardSetRow[], { merge: false }>();

      if (error) {
        return requestFailed();
      }

      return { ok: true, data: data.map(toSetSummary) };
    },

    async getSetWithCards(setId) {
      if (!isNonEmpty(setId)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .from("flashcard_sets")
        .select("id, title, created_at, flashcards(id, question, answer, created_at)")
        .eq("id", setId)
        .maybeSingle()
        .overrideTypes<FlashcardSetWithCardsRow | null, { merge: false }>();

      if (error) {
        return requestFailed();
      }
      if (!data) {
        return notFound();
      }

      return {
        ok: true,
        data: {
          ...toSetSummary(data),
          cards: (data.flashcards ?? [])
            .map(toFlashcard)
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)),
        },
      };
    },

    async addCard(setId, input) {
      if (!isNonEmpty(setId) || !isNonEmpty(input.question) || !isNonEmpty(input.answer)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .from("flashcards")
        .insert({ set_id: setId, question: input.question, answer: input.answer })
        .select("id, question, answer, created_at")
        .maybeSingle()
        .overrideTypes<FlashcardRow | null, { merge: false }>();

      if (error) {
        return requestFailed();
      }
      if (!data) {
        return notFound();
      }

      return { ok: true, data: toFlashcard(data) };
    },

    async updateCard(cardId, input) {
      if (!isNonEmpty(cardId) || !isNonEmpty(input.question) || !isNonEmpty(input.answer)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .from("flashcards")
        .update({ question: input.question, answer: input.answer })
        .eq("id", cardId)
        .select("id, question, answer, created_at")
        .maybeSingle()
        .overrideTypes<FlashcardRow | null, { merge: false }>();

      if (error) {
        return requestFailed();
      }
      if (!data) {
        return notFound();
      }

      return { ok: true, data: toFlashcard(data) };
    },

    async deleteCard(cardId) {
      if (!isNonEmpty(cardId)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .from("flashcards")
        .delete()
        .eq("id", cardId)
        .select("id")
        .maybeSingle()
        .overrideTypes<{ id: string } | null, { merge: false }>();

      if (error) {
        return requestFailed();
      }
      if (!data) {
        return notFound();
      }

      return { ok: true, data: undefined };
    },

    async deleteSet(setId) {
      if (!isNonEmpty(setId)) {
        return invalidInput();
      }

      const { data, error } = await supabase
        .from("flashcard_sets")
        .delete()
        .eq("id", setId)
        .select("id")
        .maybeSingle()
        .overrideTypes<{ id: string } | null, { merge: false }>();

      if (error) {
        return requestFailed();
      }
      if (!data) {
        return notFound();
      }

      return { ok: true, data: undefined };
    },
  };
}
