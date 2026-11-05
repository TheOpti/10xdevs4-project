/**
 * Truncates text to a maximum character length, appending a suffix if truncated.
 *
 * @param text The input string to truncate.
 * @param maxLength The maximum allowed length, including suffix.
 * @param suffix The string appended when truncated (defaults to "...").
 */
export function truncate(text: string, maxLength: number, suffix = "..."): string {
  if (typeof text !== "string" || maxLength <= 0) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  const sliceLength = Math.max(0, maxLength - suffix.length);
  return text.slice(0, sliceLength) + suffix;
}

/**
 * Formats a duration given in seconds into a concise human-readable string (e.g. "2m 15s").
 *
 * @param totalSeconds The non-negative duration in seconds.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }
  const rounded = Math.floor(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
