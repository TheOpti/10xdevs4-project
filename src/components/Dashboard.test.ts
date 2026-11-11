import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Dashboard from "./Dashboard";
import type { CatalogFilter } from "@/lib/flashcard-views";

function emptyCatalog(filter: CatalogFilter) {
  return renderToStaticMarkup(
    createElement(Dashboard, {
      view: { status: "ready", sets: [], totalSetsCount: 0, availableTags: [], filter },
    }),
  );
}

describe("empty catalog filter recovery", () => {
  it("keeps All sets and Untagged available alongside the first-set prompt", () => {
    const html = emptyCatalog({ type: "all" });
    expect(html).toContain('value="all" selected=""');
    expect(html).toContain('value="untagged"');
    expect(html).toContain("No sets yet");
    expect(html).toContain("Create a set");
    expect(html).not.toContain("No matching sets");
    expect(html).not.toContain("Clear filter");
  });

  it.each([
    [{ type: "tag", tag: "obsolete" }, "tag:obsolete"],
    [{ type: "untagged" }, "untagged"],
  ] as const)("keeps an active empty-catalog filter visible and recoverable: %s", (filter, value) => {
    const html = emptyCatalog(filter);
    expect(html).toContain(`value="${value}" selected=""`);
    expect(html).toContain("No matching sets");
    expect(html).toMatch(/href="\/dashboard"[^>]*>Clear filter<\/a>/);
    expect(html).not.toContain("No sets yet");
  });
});
