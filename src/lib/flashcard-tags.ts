export const MAX_SET_TAGS = 10;
export const MAX_TAG_CODE_POINTS = 30;

export function normalizeTag(entry: unknown): string | null {
  if (typeof entry !== "string") return null;
  const tag = entry.trim().replace(/\s+/gu, " ").toLowerCase();
  if (tag.length === 0 || Array.from(tag).length > MAX_TAG_CODE_POINTS) return null;
  return tag;
}

export function toTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const tags = new Set<string>();
  for (const entry of value) {
    const tag = normalizeTag(entry);
    if (!tag) return null;
    tags.add(tag);
  }
  return tags.size <= MAX_SET_TAGS ? [...tags] : null;
}
