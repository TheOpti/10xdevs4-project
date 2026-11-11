import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createCatalogFixtureCollection, createFlashcardFixture } from "./flashcard-fixture";

test("keeps unadded tag input and card drafts during keyboard tag editing on a narrow screen", async ({
  page,
}, testInfo) => {
  const fixture = await createFlashcardFixture();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/dashboard/sets/${fixture.setId}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Answer", { exact: true }).fill("Keep this card draft");
    const input = page.getByLabel("Tag name");
    await input.fill("keyboard tag");
    let saves = 0;
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().endsWith(`/sets/${fixture.setId}/tags`)) saves++;
    });
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(page.getByText("Use Add tag before saving, or clear the tag name.")).toBeVisible();
    await expect(input).toHaveValue("keyboard tag");
    await expect(input).toBeFocused();
    expect(saves).toBe(0);
    await page.keyboard.press("Enter");
    await input.fill("second tag");
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(input).toHaveValue("second tag");
    expect(saves).toBe(0);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save tags", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Tags saved.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("Keep this card draft");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("narrow-tag-editor.png"), fullPage: true });
    await page.getByRole("link", { name: "Back to collections", exact: true }).click();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    const filter = page.getByLabel("Filter sets by tag");
    await filter.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/dashboard?untagged=1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("narrow-filter.png"), fullPage: true });
  } finally {
    await fixture.cleanup();
  }
});

test("two stale tabs replace tags with the last successful write and recover an obsolete filter", async ({
  page,
  context,
}) => {
  const fixture = await createFlashcardFixture(false);
  const second = await context.newPage();
  const obsoleteTag = `obsolete-${randomUUID().slice(0, 8)}`;
  try {
    for (const tab of [page, second]) {
      await tab.goto(`/dashboard/sets/${fixture.setId}`);
      await expect(tab.locator("astro-island[ssr]")).toHaveCount(0);
    }
    await page.getByLabel("Tag name").fill(obsoleteTag);
    await page.getByRole("button", { name: "Add tag", exact: true }).click();
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(page.getByText("Tags saved.", { exact: true })).toBeVisible();
    await second.getByLabel("Tag name").fill("last writer");
    await second.getByRole("button", { name: "Add tag", exact: true }).click();
    await second.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(second.getByText("Tags saved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("list", { name: "Current tags" })).toHaveText("last writer");
    await page.goto(`/dashboard?tag=${obsoleteTag}`);
    await expect(page.getByRole("heading", { name: "No matching sets" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filter", exact: true }).first().click();
    await expect(page.getByRole("link", { name: fixture.title, exact: true })).toBeVisible();
  } finally {
    await second.close();
    await fixture.cleanup();
  }
});

test("malformed filter encodings reset catalog and detail navigation", async ({ page }) => {
  const fixture = await createFlashcardFixture(false);
  try {
    for (const query of ["?tag=%ZZ", "?tag=%FF"]) {
      await page.goto(`/dashboard${query}`);
      await expect(page.getByLabel("Filter sets by tag")).toHaveValue("all");
      await expect(page.getByRole("link", { name: fixture.title, exact: true })).toHaveAttribute(
        "href",
        `/dashboard/sets/${fixture.setId}`,
      );
      await page.goto(`/dashboard/sets/${fixture.setId}${query}`);
      await expect(page.getByRole("link", { name: "Back to collections", exact: true })).toHaveAttribute(
        "href",
        "/dashboard",
      );
    }
  } finally {
    await fixture.cleanup();
  }
});

test("filters catalog by tag and untagged, preserves filter in navigation, and updates tags persistently", async ({
  page,
}) => {
  const runId = randomUUID().slice(0, 8);
  const sharedTag = `shared-${runId}`;
  const bioTag = `bio-${runId}`;
  const chemTag = `chem-${runId}`;
  const emptyTag = `empty-${runId}`;
  const addedTag = `added-${runId}`;

  const fixtureCollection = await createCatalogFixtureCollection([
    { titlePrefix: `Catalog Set Bio ${runId}`, tags: [sharedTag, bioTag], withCard: true },
    { titlePrefix: `Catalog Set Chem ${runId}`, tags: [sharedTag, chemTag], withCard: true },
    { titlePrefix: `Catalog Set Untagged ${runId}`, tags: [], withCard: true },
    { titlePrefix: `Catalog Set Empty ${runId}`, tags: [emptyTag], withCard: false },
  ]);

  const [setBio, setChem, setUntagged, setEmpty] = fixtureCollection.sets;

  try {
    // 1. Visit dashboard and verify initial rendering
    await page.goto("/dashboard");
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    const filterSelect = page.getByLabel("Filter sets by tag");
    await expect(filterSelect).toBeVisible();

    // Verify all 4 created sets are visible in the unfiltered catalog (including empty set)
    await expect(page.getByRole("link", { name: setBio.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setChem.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setUntagged.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setEmpty.title, exact: true })).toBeVisible();

    // Verify filter choices contain All sets, Untagged, and our tags
    await expect(filterSelect.locator(`option[value="all"]`)).toBeAttached();
    await expect(filterSelect.locator(`option[value="untagged"]`)).toBeAttached();
    await expect(filterSelect.locator(`option[value="tag:${sharedTag}"]`)).toBeAttached();
    await expect(filterSelect.locator(`option[value="tag:${bioTag}"]`)).toBeAttached();
    await expect(filterSelect.locator(`option[value="tag:${chemTag}"]`)).toBeAttached();
    await expect(filterSelect.locator(`option[value="tag:${emptyTag}"]`)).toBeAttached();

    // 2. Filter by overlapping tag (sharedTag)
    await filterSelect.selectOption({ value: `tag:${sharedTag}` });
    await page.waitForURL((url) => url.pathname === "/dashboard" && url.searchParams.get("tag") === sharedTag);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await expect(page.getByRole("link", { name: setBio.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setChem.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setUntagged.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: setEmpty.title, exact: true })).toHaveCount(0);

    // 3. Refresh and verify filter survives
    await page.reload();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByLabel("Filter sets by tag")).toHaveValue(`tag:${sharedTag}`);
    await expect(page.getByRole("link", { name: setBio.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setChem.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setUntagged.title, exact: true })).toHaveCount(0);

    // 4. Detail navigation from filtered catalog carries filter query parameter
    await page.getByRole("link", { name: setBio.title, exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/sets/${setBio.setId}?tag=${encodeURIComponent(sharedTag)}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: setBio.title, exact: true })).toBeVisible();
    await expect(page.getByText(sharedTag, { exact: true })).toBeVisible();
    await expect(page.getByText(bioTag, { exact: true })).toBeVisible();

    // 5. Return navigation preserves the filter on dashboard
    await page.getByRole("link", { name: "Back to collections", exact: true }).click();
    await expect(page).toHaveURL(`/dashboard?tag=${encodeURIComponent(sharedTag)}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByLabel("Filter sets by tag")).toHaveValue(`tag:${sharedTag}`);

    // 6. Filter by Untagged
    await page.getByLabel("Filter sets by tag").selectOption({ value: "untagged" });
    await page.waitForURL((url) => url.pathname === "/dashboard" && url.searchParams.get("untagged") === "1");
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await expect(page.getByRole("link", { name: setUntagged.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setBio.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: setChem.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: setEmpty.title, exact: true })).toHaveCount(0);

    // 7. Filter by empty set's tag and verify empty-set retention
    await page.getByLabel("Filter sets by tag").selectOption({ value: `tag:${emptyTag}` });
    await page.waitForURL((url) => url.pathname === "/dashboard" && url.searchParams.get("tag") === emptyTag);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await expect(page.getByRole("link", { name: setEmpty.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: setBio.title, exact: true })).toHaveCount(0);

    // Navigate to empty set and verify empty-set state is displayed
    await page.getByRole("link", { name: setEmpty.title, exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/sets/${setEmpty.setId}?tag=${encodeURIComponent(emptyTag)}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No cards in this set" })).toBeVisible();

    // 8. Remove the last tag assignment (emptyTag) and save
    await page.getByRole("button", { name: `Remove tag ${emptyTag}`, exact: true }).click();
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(page.getByText("Tags saved.", { exact: true })).toBeVisible();

    // Return to collections: the return link had ?tag=emptyTag, which now has 0 matches
    await page.getByRole("link", { name: "Back to collections", exact: true }).click();
    await expect(page).toHaveURL(`/dashboard?tag=${encodeURIComponent(emptyTag)}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No matching sets" })).toBeVisible();
    await expect(page.getByText(`No sets are tagged with "${emptyTag}".`)).toBeVisible();

    // 9. Clearing filters restores all sets
    await page.getByRole("link", { name: "Clear filter", exact: true }).first().click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    // Verify emptyTag is no longer in the filter dropdown since no set uses it anymore
    await expect(page.getByLabel("Filter sets by tag").locator(`option[value="tag:${emptyTag}"]`)).toHaveCount(0);
    // And setEmpty now appears in the catalog as Untagged
    await expect(page.getByRole("link", { name: setEmpty.title, exact: true })).toBeVisible();

    // 10. Persistent tag updates: add a new tag to the untagged set
    await page.getByRole("link", { name: setUntagged.title, exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/sets/${setUntagged.setId}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await page.getByLabel("Tag name").fill(addedTag);
    await page.getByRole("button", { name: "Add tag", exact: true }).click();
    await expect(page.getByText(addedTag, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await expect(page.getByText("Tags saved.", { exact: true })).toBeVisible();

    // Reload set page and verify persisted
    await page.reload();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByText(addedTag, { exact: true })).toBeVisible();

    // Return to dashboard and verify the tag is now present on the card and in the filter dropdown
    await page.getByRole("link", { name: "Back to collections", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByLabel("Filter sets by tag").locator(`option[value="tag:${addedTag}"]`)).toBeAttached();
    const untaggedCardTags = page.getByRole("list", { name: `Tags for ${setUntagged.title}` });
    await expect(untaggedCardTags.getByText(addedTag, { exact: true })).toBeVisible();
  } finally {
    await fixtureCollection.cleanup();
  }
});

test("simulates a failed save and verifies that the tag draft remains available for retry", async ({ page }) => {
  const fixture = await createFlashcardFixture({ withCard: false, titlePrefix: "Draft retention fixture" });
  try {
    await page.goto(`/dashboard/sets/${fixture.setId}`);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    // Add a draft tag
    const draftTag = "resilient-draft";
    await page.getByLabel("Tag name").fill(draftTag);
    await page.getByRole("button", { name: "Add tag", exact: true }).click();
    await expect(page.getByText(draftTag, { exact: true })).toBeVisible();

    // Simulate failure by aborting tag PATCH requests
    await page.route("**/api/flashcards/sets/*/tags", async (route) => {
      await route.abort("failed");
    });

    await page.getByRole("button", { name: "Save tags", exact: true }).click();

    // Verify error message and that the draft tag is still intact
    await expect(
      page.getByText("We could not save your tags. Your changes are kept here. Try saving again."),
    ).toBeVisible();
    await expect(page.getByText(draftTag, { exact: true })).toBeVisible();

    // The save button now displays "Retry save"
    const retryButton = page.getByRole("button", { name: "Retry save", exact: true });
    await expect(retryButton).toBeVisible();

    // Remove route abort to allow successful save upon retry
    await page.unroute("**/api/flashcards/sets/*/tags");
    await retryButton.click();
    await expect(page.getByText("Tags saved.", { exact: true })).toBeVisible();

    // Reload page to verify the tag was indeed persisted to the database
    await page.reload();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await expect(page.getByText(draftTag, { exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
