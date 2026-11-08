import { isUuid } from "@/lib/flashcard-validation";
import type { FlashcardRepository, FlashcardSetSummary, FlashcardSetWithCards } from "@/lib/flashcards";

export type SetView = { status: "ready"; set: FlashcardSetWithCards } | { status: "not-found" | "unavailable" };
export type SetListView = { status: "ready"; sets: FlashcardSetSummary[] } | { status: "unavailable" };

export async function loadSetView(
  repository: Pick<FlashcardRepository, "getSetWithCards"> | null,
  id: string | undefined,
): Promise<SetView> {
  if (!isUuid(id)) return { status: "not-found" };
  if (!repository) return { status: "unavailable" };
  try {
    const result = await repository.getSetWithCards(id);
    if (result.ok) return { status: "ready", set: result.data };
    return { status: result.error === "not-found" ? "not-found" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadSetListView(repository: Pick<FlashcardRepository, "listSets"> | null): Promise<SetListView> {
  if (!repository) return { status: "unavailable" };
  try {
    const result = await repository.listSets();
    return result.ok ? { status: "ready", sets: result.data } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
