import { normalizeTag } from "@/lib/flashcard-tags";
import { isUuid } from "@/lib/flashcard-validation";
import type { FlashcardRepository, FlashcardSetSummary, FlashcardSetWithCards } from "@/lib/flashcards";

export type SetView = { status: "ready"; set: FlashcardSetWithCards } | { status: "not-found" | "unavailable" };

export type CatalogFilter = { type: "all" } | { type: "untagged" } | { type: "tag"; tag: string };

export interface SetListReadyView {
  status: "ready";
  sets: FlashcardSetSummary[];
  totalSetsCount: number;
  availableTags: string[];
  filter: CatalogFilter;
}

export type SetListView = SetListReadyView | { status: "unavailable" };

export function parseCatalogFilter(input: URLSearchParams | string | null | undefined): CatalogFilter {
  if (!input) return { type: "all" };
  const params =
    typeof input === "string" ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input) : input;

  const tagValues = params.getAll("tag");
  const untaggedValues = params.getAll("untagged");

  if (tagValues.length > 0 && untaggedValues.length > 0) {
    return { type: "all" };
  }

  if (tagValues.length > 1 || untaggedValues.length > 1) {
    return { type: "all" };
  }

  if (untaggedValues.length === 1) {
    if (untaggedValues[0] === "1") {
      return { type: "untagged" };
    }
    return { type: "all" };
  }

  if (tagValues.length === 1) {
    const normalized = normalizeTag(tagValues[0]);
    if (normalized !== null) {
      return { type: "tag", tag: normalized };
    }
    return { type: "all" };
  }

  return { type: "all" };
}

export function formatCatalogQuery(filter: CatalogFilter): string {
  switch (filter.type) {
    case "tag":
      return `?tag=${encodeURIComponent(filter.tag)}`;
    case "untagged":
      return "?untagged=1";
    case "all":
      return "";
  }
}

export function formatCatalogHref(filter: CatalogFilter): string {
  return `/dashboard${formatCatalogQuery(filter)}`;
}

export function formatSetHref(setId: string, filter: CatalogFilter): string {
  return `/dashboard/sets/${setId}${formatCatalogQuery(filter)}`;
}

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

export async function loadSetListView(
  repository: Pick<FlashcardRepository, "listSets"> | null,
  searchParams?: URLSearchParams | string | null,
): Promise<SetListView> {
  if (!repository) return { status: "unavailable" };
  try {
    const result = await repository.listSets();
    if (!result.ok) return { status: "unavailable" };

    const allSets = result.data;
    const filter = parseCatalogFilter(searchParams);

    const tagSet = new Set<string>();
    for (const set of allSets) {
      for (const tag of set.tags) {
        tagSet.add(tag);
      }
    }
    const availableTags = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

    let filteredSets = allSets;
    if (filter.type === "untagged") {
      filteredSets = allSets.filter((s) => s.tags.length === 0);
    } else if (filter.type === "tag") {
      filteredSets = allSets.filter((s) => s.tags.includes(filter.tag));
    }

    return {
      status: "ready",
      sets: filteredSets,
      totalSetsCount: allSets.length,
      availableTags,
      filter,
    };
  } catch {
    return { status: "unavailable" };
  }
}
