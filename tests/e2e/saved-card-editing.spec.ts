import { expect, test } from "@playwright/test";
import { createFlashcardFixture } from "./flashcard-fixture";

test("opens a saved set, persists edits, cancels drafts and retains the empty set", async ({ page }) => {
  const fixture = await createFlashcardFixture();
  try {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: fixture.title, exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/sets/${fixture.setId}`);
    await expect(page.getByText("Fixture question", { exact: true })).toBeVisible();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Question", { exact: true }).fill("Edited question");
    await page.getByLabel("Answer", { exact: true }).fill("Edited answer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Card saved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Edited question", { exact: true })).toBeVisible();
    await expect(page.getByText("Edited answer", { exact: true })).toBeVisible();
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Answer", { exact: true }).fill("Discarded draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Edited answer", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Discarded draft", { exact: true })).toHaveCount(0);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Delete this flashcard permanently? This cannot be undone.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel deletion", exact: true }).click();
    await expect(page.getByText("Edited answer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
    await page.getByRole("link", { name: "Back to collections" }).click();
    await page.getByRole("link", { name: fixture.title, exact: true }).click();
    await expect(page.getByRole("heading", { name: fixture.title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

for (const outcome of ["confirmed", "edited", "deleted"] as const) {
  test(`proposal save links to the correct set after ${outcome} outcome`, async ({ page }) => {
    const fixture = await createFlashcardFixture(false);
    const requests: { requestId: string; cards: unknown[] }[] = [];
    let savedCardId = "";
    try {
      await page.route("**/api/flashcards/generate", async (route) => {
        await route.fulfill({
          json: {
            setId: fixture.setId,
            proposals: [{ question: "Proposal question", answer: "Proposal answer", qualityFlags: [] }],
          },
        });
      });
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/flashcards/save") {
          requests.push(request.postDataJSON() as { requestId: string; cards: unknown[] });
        }
      });
      if (outcome !== "confirmed") {
        await page.route(
          "**/api/flashcards/save",
          async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            const body = (await response.json()) as { cards: { id: string }[] };
            savedCardId = body.cards[0].id;
            await route.abort("failed");
          },
          { times: 1 },
        );
      }
      await page.goto("/dashboard/new");
      await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
      await page.getByLabel("Set title").fill(fixture.title);
      await page.getByLabel("Source text").fill("Test source text without an AI request.");
      await page.getByRole("button", { name: "Generate flashcards" }).click();
      await page.getByRole("button", { name: "Accept all & save" }).click();
      if (outcome === "confirmed") {
        const link = page.getByRole("link", { name: "Open saved set" });
        await expect(link).toHaveAttribute("href", `/dashboard/sets/${fixture.setId}`);
        await link.click();
        await expect(page.getByText("Proposal question", { exact: true })).toBeVisible();
      } else {
        const link = page.getByRole("link", { name: "Check saved set" });
        await expect(link).toHaveAttribute("href", `/dashboard/sets/${fixture.setId}`);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("Proposal answer");
        expect(savedCardId).not.toBe("");
        const mutation =
          outcome === "edited"
            ? await page.request.patch(`/api/flashcards/cards/${savedCardId}`, {
                data: { question: "Proposal question", answer: "Saved edit" },
              })
            : await page.request.delete(`/api/flashcards/cards/${savedCardId}`, {
                headers: { Origin: new URL(page.url()).origin },
              });
        expect(mutation.status()).toBe(outcome === "edited" ? 200 : 204);
        await page.getByRole("button", { name: "Accept all & save" }).click();
        await expect(page.getByRole("alert")).toContainText(
          outcome === "edited" ? "could not confirm which" : "could not confirm the save",
        );
        await expect(link).toBeVisible();
        await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("Proposal answer");
        await expect(page.getByRole("link", { name: "Open saved set" })).toHaveCount(0);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        const popup = page.waitForEvent("popup");
        await link.click();
        const savedPage = await popup;
        await savedPage.waitForLoadState();
        if (outcome === "edited") await expect(savedPage.getByText("Saved edit", { exact: true })).toBeVisible();
        else await expect(savedPage.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
        await savedPage.close();
      }
    } finally {
      await fixture.cleanup();
    }
  });
}
