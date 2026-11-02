import { Buffer } from "node:buffer";
import { nonReviewOutcome } from "./contract.mjs";

export const DESCRIPTION_LIMIT = 8000;
export const DIFF_BYTE_LIMIT = 102400;
export const FILE_LIMIT = 3000;

const unavailable = () => nonReviewOutcome("unavailable", "unsupported-or-incomplete-input");
const count = (value) => Number.isSafeInteger(value) && value >= 0;
// Quoted/escaped paths need a separate proven decoder; fail closed for now.
const pathSupported = (value) => typeof value === "string" && /^[\x21-\x7e]+$/.test(value) && !/["\\]/.test(value);
const withoutFinalNewline = (text) => (text.endsWith("\n") ? text.slice(0, -1) : text);

function validateHunks(patch, file) {
  const lines = patch.split("\n");
  let index = 0;
  let additions = 0;
  let deletions = 0;
  let oldEnd = 0;
  let newEnd = 0;
  let oldEof = false;
  let newEof = false;
  while (index < lines.length) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index++]);
    if (!match) return false;
    const [oldStart, oldCount, newStart, newCount] = [match[1], match[2] ?? "1", match[3], match[4] ?? "1"].map(Number);
    if (
      ![oldStart, oldCount, newStart, newCount].every(count) ||
      oldCount + newCount === 0 ||
      (oldCount > 0 && oldStart === 0) ||
      (newCount > 0 && newStart === 0)
    )
      return false;
    // Zero-count ranges point after the preceding line; nonempty ranges are 1-based.
    const oldOffset = oldCount === 0 ? oldStart : oldStart - 1;
    const newOffset = newCount === 0 ? newStart : newStart - 1;
    if (oldOffset < oldEnd || newOffset < newEnd || oldOffset - oldEnd !== newOffset - newEnd) return false;
    if (file.status === "added" && (oldStart !== 0 || oldCount !== 0 || newOffset !== 0)) return false;
    if (file.status === "removed" && (newStart !== 0 || newCount !== 0 || oldOffset !== 0)) return false;
    oldEnd = oldOffset + oldCount;
    newEnd = newOffset + newCount;
    let oldSeen = 0;
    let newSeen = 0;
    let previous = "";
    let changed = false;
    while (index < lines.length && !lines[index].startsWith("@@")) {
      const line = lines[index++];
      if (line === "\\ No newline at end of file") {
        if (!previous) return false;
        if (previous !== "+") oldEof = true;
        if (previous !== "-") newEof = true;
        previous = "";
        continue;
      }
      const prefix = line[0];
      if (![" ", "+", "-"].includes(prefix)) return false;
      if ((prefix !== "+" && oldEof) || (prefix !== "-" && newEof)) return false;
      if (prefix !== "+") oldSeen++;
      if (prefix !== "-") newSeen++;
      if (prefix === "+") additions++;
      if (prefix === "-") deletions++;
      if (prefix !== " ") changed = true;
      previous = prefix;
      if (oldSeen > oldCount || newSeen > newCount) return false;
    }
    if (!changed || oldSeen !== oldCount || newSeen !== newCount) return false;
  }
  return (
    additions === file.additions &&
    deletions === file.deletions &&
    (file.status !== "added" || deletions === 0) &&
    (file.status !== "removed" || additions === 0)
  );
}

function validateSection(section, file) {
  const oldPath = file.status === "renamed" ? file.previous_filename : file.filename;
  if (!pathSupported(oldPath) || section[0] !== "diff --git a/" + oldPath + " b/" + file.filename) return false;
  let index = 1;
  if (file.status === "added" || file.status === "removed") {
    const prefix = file.status === "added" ? "new file mode " : "deleted file mode ";
    if (![prefix + "100644", prefix + "100755"].includes(section[index++])) return false;
  }
  if (file.status === "renamed") {
    if (
      !/^similarity index (?:100|[1-9]?\d)%$/.test(section[index++]) ||
      section[index++] !== "rename from " + oldPath ||
      section[index++] !== "rename to " + file.filename
    )
      return false;
  }
  const indexLine = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (100644|100755))?$/.exec(section[index++]);
  if (!indexLine) return false;
  if (["modified", "renamed"].includes(file.status) && !indexLine[3]) return false;
  if (file.status === "added" && (!/^0+$/.test(indexLine[1]) || indexLine[3])) return false;
  if (file.status === "removed" && (!/^0+$/.test(indexLine[2]) || indexLine[3])) return false;
  if (
    section[index++] !== "--- " + (file.status === "added" ? "/dev/null" : "a/" + oldPath) ||
    section[index++] !== "+++ " + (file.status === "removed" ? "/dev/null" : "b/" + file.filename)
  )
    return false;
  const patch = section.slice(index).join("\n");
  return patch === withoutFinalNewline(file.patch) && validateHunks(patch, file);
}

/**
 * Transport passes every fetched files-page, the PR's changed_files and the raw
 * diff from the same stable snapshot. Count equality alone is not sufficient:
 * paths, textual patches, hunk lengths and API change totals must also agree.
 * Unsupported representations (metadata-only changes, non-regular files and
 * paths requiring quoting/escaping or containing whitespace) are unavailable.
 * No input is executed, fetched, logged or silently filtered here.
 */
export function validateInput({ title, description = "", changedFiles, filePages, diff } = {}) {
  if (
    typeof title !== "string" ||
    !title.trim() ||
    (description !== null && typeof description !== "string") ||
    !count(changedFiles) ||
    changedFiles === 0 ||
    changedFiles > FILE_LIMIT ||
    !Array.isArray(filePages) ||
    filePages.length === 0 ||
    filePages.length > FILE_LIMIT ||
    !filePages.every((page) => Array.isArray(page) && page.length > 0 && page.length <= 100) ||
    typeof diff !== "string" ||
    !diff.endsWith("\n") ||
    Buffer.byteLength(diff, "utf8") > DIFF_BYTE_LIMIT
  )
    return unavailable();
  const files = filePages.flat();
  if (files.length !== changedFiles || new Set(files.map((file) => file?.filename)).size !== files.length)
    return unavailable();
  for (const file of files) {
    if (
      !file ||
      !pathSupported(file.filename) ||
      !["added", "removed", "modified", "renamed"].includes(file.status) ||
      !count(file.additions) ||
      !count(file.deletions) ||
      !count(file.changes) ||
      file.changes !== file.additions + file.deletions ||
      file.changes === 0 ||
      typeof file.patch !== "string" ||
      !file.patch.startsWith("@@") ||
      (file.status === "renamed" &&
        (!pathSupported(file.previous_filename) || file.previous_filename === file.filename))
    )
      return unavailable();
  }
  const sections = [];
  for (const line of withoutFinalNewline(diff).split("\n")) {
    if (line.startsWith("diff --git ")) sections.push([]);
    if (sections.length === 0) return unavailable();
    sections.at(-1).push(line);
  }
  if (sections.length !== files.length) return unavailable();
  const byHeader = new Map(
    files.map((file) => [
      "diff --git a/" + (file.status === "renamed" ? file.previous_filename : file.filename) + " b/" + file.filename,
      file,
    ]),
  );
  for (const section of sections) {
    const file = byHeader.get(section[0]);
    if (!file || !validateSection(section, file)) return unavailable();
    byHeader.delete(section[0]);
  }
  if (byHeader.size !== 0) return unavailable();
  const codePoints = [...(description ?? "")];
  return {
    status: "complete",
    input: {
      title,
      description: codePoints.slice(0, DESCRIPTION_LIMIT).join(""),
      descriptionTruncated: codePoints.length > DESCRIPTION_LIMIT,
      descriptionNotice:
        codePoints.length > DESCRIPTION_LIMIT
          ? "Description excerpt: first 8,000 Unicode code points."
          : "Complete description.",
      diff,
      files: files.map((file) => ({
        oldPath: file.status === "added" ? null : file.status === "renamed" ? file.previous_filename : file.filename,
        newPath: file.status === "removed" ? null : file.filename,
        status: file.status,
      })),
    },
  };
}
