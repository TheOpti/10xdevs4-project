const MAX_SET_TAGS = 10;
const MAX_TAG_CODE_POINTS = 30;

export function toTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const tags = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const tag = entry.trim().replace(/\s+/gu, " ").toLowerCase();
    if (tag.length === 0 || Array.from(tag).length > MAX_TAG_CODE_POINTS) return null;
    tags.add(tag);
  }
  return tags.size <= MAX_SET_TAGS ? [...tags] : null;
}
