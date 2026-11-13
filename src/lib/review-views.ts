import type { ReviewQueue, ReviewRepository } from "@/lib/flashcard-reviews";
import { parseCatalogFilter, type CatalogFilter } from "@/lib/flashcard-views";
import { isUuid } from "@/lib/flashcard-validation";

export type ReviewView =
  { status: "ready"; queue: ReviewQueue; filter: CatalogFilter } | { status: "not-found" | "unavailable" };

export async function loadReviewView(
  repository: Pick<ReviewRepository, "getQueue"> | null,
  setId: string | undefined,
  search?: string,
): Promise<ReviewView> {
  if (!isUuid(setId)) return { status: "not-found" };
  if (!repository) return { status: "unavailable" };
  try {
    const result = await repository.getQueue(setId);
    if (result.ok) return { status: "ready", queue: result.data, filter: parseCatalogFilter(search) };
    return { status: result.error === "not-found" ? "not-found" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
