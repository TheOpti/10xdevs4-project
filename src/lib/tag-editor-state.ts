import { normalizeTag, toTags, MAX_SET_TAGS } from "@/lib/flashcard-tags";

export interface TagEditorState {
  confirmedTags: string[];
  draftTags: string[];
  input: string;
  pending: boolean;
  missing: boolean;
  message: string | null;
}

export function initialTagState(tags: string[] = []): TagEditorState {
  return {
    confirmedTags: [...tags],
    draftTags: [...tags],
    input: "",
    pending: false,
    missing: false,
    message: null,
  };
}

export type TagEditorAction =
  | { type: "input"; value: string }
  | { type: "add" }
  | { type: "remove"; tag: string }
  | { type: "cancel" }
  | { type: "pending" }
  | { type: "saved"; tags: string[] }
  | { type: "failed"; message: string; missing?: boolean };

export function tagEditorReducer(state: TagEditorState, action: TagEditorAction): TagEditorState {
  if (state.pending && action.type !== "saved" && action.type !== "failed") {
    return state;
  }

  switch (action.type) {
    case "input":
      return { ...state, input: action.value, message: null };

    case "add": {
      if (state.missing) return state;
      const raw = state.input.trim();
      if (raw.length === 0) {
        return { ...state, message: "Enter a tag containing 1–30 characters." };
      }
      const tag = normalizeTag(state.input);
      if (!tag) {
        return { ...state, message: "Tags must contain between 1 and 30 characters." };
      }
      if (state.draftTags.includes(tag)) {
        return { ...state, input: "", message: "This tag is already in your list." };
      }
      if (state.draftTags.length >= MAX_SET_TAGS) {
        return { ...state, message: `Sets are limited to ${MAX_SET_TAGS} tags.` };
      }
      return {
        ...state,
        draftTags: [...state.draftTags, tag],
        input: "",
        message: null,
      };
    }

    case "remove": {
      if (state.missing) return state;
      return {
        ...state,
        draftTags: state.draftTags.filter((t) => t !== action.tag),
        message: null,
      };
    }

    case "cancel":
      return initialTagState(state.confirmedTags);

    case "pending":
      return { ...state, pending: true, message: null };

    case "saved":
      return {
        ...initialTagState(action.tags),
        message: "Tags saved.",
      };

    case "failed":
      return {
        ...state,
        pending: false,
        missing: action.missing ?? false,
        message: action.message,
      };
  }
}

export function tagsFromResponse(value: unknown): string[] | null {
  if (typeof value !== "object" || value === null || !("tags" in value)) return null;
  const { tags } = value;
  return toTags(tags);
}
