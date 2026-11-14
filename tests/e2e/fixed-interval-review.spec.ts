import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createReviewFixture } from "./flashcard-fixture";

async function openReview(page: Page, setId: string) {
  const response = await page.goto(`/dashboard/sets/${setId}/review?tag=review%20test`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
async function reveal(page: Page) {
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
}

for (const [label, hours] of [
  ["Don't know — 24 hours", 24],
  ["Hard — 72 hours", 72],
  ["Know — 168 hours", 168],
] as const) {
  test(`persists ${label} and excludes the card after reload`, async ({ page }) => {
    const fixture = await createReviewFixture();
    try {
      await page.goto(`/dashboard/sets/${fixture.setId}?tag=review%20test`);
      await page.getByRole("link", { name: "Start review" }).click();
      await expect(page).toHaveURL(`/dashboard/sets/${fixture.setId}/review?tag=review%20test`);
      await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
      await expect(page.getByText(fixture.cards[0].answer, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
      await reveal(page);
      const responsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/review") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: label, exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { review: { dueAt: string; ratedAt: string } };
      expect(Date.parse(body.review.dueAt) - Date.parse(body.review.ratedAt)).toBe(hours * 3600000);
      await expect(page.getByRole("heading", { name: "Review finished" })).toBeFocused();
      await expect(page.getByText("Saved: 1", { exact: true })).toBeVisible();
      await expect(page.getByText("Skipped: 0", { exact: true })).toBeVisible();
      const stored = (await fixture.readCards())[0];
      expect(Date.parse(stored.due_at)).toBe(Date.parse(body.review.dueAt));
      await page.reload();
      await expect(page.getByRole("heading", { name: "No cards due" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Review finished" })).toHaveCount(0);
      await page.getByRole("link", { name: "Back to set", exact: true }).click();
      await expect(page).toHaveURL(`/dashboard/sets/${fixture.setId}?tag=review%20test`);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("distinguishes an empty set and a missing set", async ({ page }) => {
  const fixture = await createReviewFixture(0);
  try {
    await page.goto(`/dashboard/sets/${fixture.setId}`);
    await expect(page.getByRole("link", { name: "Start review" })).toHaveCount(0);
    await openReview(page, fixture.setId);
    await expect(page.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review finished" })).toHaveCount(0);
    const response = await page.goto(`/dashboard/sets/${randomUUID()}/review`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Set not found" })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("re-entry keeps only due cards and resets an interrupted session", async ({ page }) => {
  const fixture = await createReviewFixture(2);
  try {
    await openReview(page, fixture.setId);
    await reveal(page);
    await page.getByRole("button", { name: "Hard — 72 hours", exact: true }).click();
    await expect(page.getByRole("heading", { name: fixture.cards[1].question, exact: true })).toBeFocused();
    await expect(page.getByText(fixture.cards[1].answer, { exact: true })).toHaveCount(0);
    await reveal(page);
    await page.getByRole("link", { name: "Exit review", exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/sets/${fixture.setId}?tag=review%20test`);
    await page.getByRole("link", { name: "Start review" }).click();
    await expect(page.getByText("Card 1 of 1 · Saved: 0 · Skipped: 0", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: fixture.cards[1].question, exact: true })).toBeVisible();
    await expect(page.getByText(fixture.cards[1].answer, { exact: true })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

for (const loss of ["network", "malformed"] as const) {
  test(`retries a committed rating after ${loss} response loss with the same receipt`, async ({ page }) => {
    const fixture = await createReviewFixture();
    const requests: unknown[] = [];
    let originalDue = "";
    try {
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().endsWith("/review")) requests.push(request.postDataJSON());
      });
      await page.route(
        "**/api/flashcards/cards/*/review",
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          const body = (await response.json()) as { review: { dueAt: string } };
          originalDue = body.review.dueAt;
          if (loss === "network") await route.abort("failed");
          else await route.fulfill({ status: 200, json: { review: {} } });
        },
        { times: 1 },
      );
      await openReview(page, fixture.setId);
      await reveal(page);
      await page.getByRole("button", { name: "Know — 168 hours", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("It may have been saved");
      await expect(page.getByRole("status")).toBeFocused();
      await expect(page.getByRole("button", { name: "Hard — 72 hours", exact: true })).toBeDisabled();
      const replayPromise = page.waitForResponse(
        (response) => response.url().endsWith("/review") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Retry rating", exact: true }).click();
      const replay = await replayPromise;
      expect(replay.status()).toBe(200);
      const replayBody = (await replay.json()) as { review: { dueAt: string } };
      expect(replayBody.review.dueAt).toBe(originalDue);
      expect(requests).toHaveLength(2);
      expect(requests[1]).toEqual(requests[0]);
      await expect(page.getByText("Saved: 1", { exact: true })).toBeVisible();
      expect(Date.parse((await fixture.readCards())[0].due_at)).toBe(Date.parse(originalDue));
    } finally {
      await fixture.cleanup();
    }
  });
}

test("reload retains a card after an uncommitted failure", async ({ page }) => {
  const fixture = await createReviewFixture();
  try {
    await page.route(
      "**/api/flashcards/cards/*/review",
      async (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
      { times: 1 },
    );
    await openReview(page, fixture.setId);
    await reveal(page);
    await page.getByRole("button", { name: "Hard — 72 hours", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("It may have been saved");
    await page.getByRole("button", { name: "Reload reviews" }).click();
    await expect(page.getByRole("heading", { name: fixture.cards[0].question, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
    expect((await fixture.readCards())[0]).toEqual(fixture.cards[0]);
  } finally {
    await fixture.cleanup();
  }
});

test("retrying a lost response after deletion skips the card without restoring it", async ({ page }) => {
  const fixture = await createReviewFixture();
  try {
    await page.route(
      "**/api/flashcards/cards/*/review",
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await openReview(page, fixture.setId);
    await reveal(page);
    await page.getByRole("button", { name: "Hard — 72 hours", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry rating" })).toBeVisible();
    const deletion = await page.request.delete(`/api/flashcards/cards/${fixture.cards[0].id}`, {
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(deletion.status()).toBe(204);
    await page.getByRole("button", { name: "Retry rating" }).click();
    await expect(page.getByRole("heading", { name: "Review finished" })).toBeVisible();
    await expect(page.getByText("Saved: 0", { exact: true })).toBeVisible();
    await expect(page.getByText("Skipped: 1", { exact: true })).toBeVisible();
    expect(await fixture.readCards()).toHaveLength(0);
  } finally {
    await fixture.cleanup();
  }
});

for (const mutation of ["rating", "edit", "deletion"] as const) {
  test(`handles another tab's ${mutation}`, async ({ page, context }) => {
    const fixture = await createReviewFixture();
    const second = await context.newPage();
    try {
      await openReview(page, fixture.setId);
      await reveal(page);
      if (mutation === "rating") {
        await openReview(second, fixture.setId);
        await reveal(second);
        await second.getByRole("button", { name: "Hard — 72 hours", exact: true }).click();
        await expect(second.getByRole("heading", { name: "Review finished" })).toBeVisible();
      } else {
        await second.goto(`/dashboard/sets/${fixture.setId}`);
        await expect(second.locator("astro-island[ssr]")).toHaveCount(0);
        if (mutation === "edit") {
          await second.getByRole("button", { name: "Edit", exact: true }).click();
          await second.getByLabel("Question", { exact: true }).fill("Changed question");
          await second.getByRole("button", { name: "Save", exact: true }).click();
          await expect(second.getByText("Card saved.", { exact: true })).toBeVisible();
        } else {
          await second.getByRole("button", { name: "Delete", exact: true }).click();
          await second.getByRole("button", { name: "Confirm deletion", exact: true }).click();
          await expect(second.getByRole("heading", { name: "No cards in this set" })).toBeVisible();
        }
      }
      await page.getByRole("button", { name: "Know — 168 hours", exact: true }).click();
      if (mutation === "deletion") {
        await expect(page.getByRole("heading", { name: "Review finished" })).toBeVisible();
        await expect(page.getByText("Saved: 0", { exact: true })).toBeVisible();
        await expect(page.getByText("Skipped: 1", { exact: true })).toBeVisible();
        await expect(page.getByRole("status")).toContainText("was skipped");
        expect(await fixture.readCards()).toHaveLength(0);
      } else {
        await expect(page.getByRole("status")).toContainText("changed or was already reviewed");
        await expect(page.getByRole("button", { name: "Know — 168 hours", exact: true })).toBeDisabled();
        await page.getByRole("button", { name: "Reload reviews" }).click();
        if (mutation === "rating") await expect(page.getByRole("heading", { name: "No cards due" })).toBeVisible();
        else {
          await expect(page.getByRole("heading", { name: "Changed question", exact: true })).toBeVisible();
          const updated = (await fixture.readCards())[0];
          expect(updated.due_at).toBe(fixture.cards[0].due_at);
          expect(updated.revision).toBe(fixture.cards[0].revision + 1);
        }
      }
    } finally {
      await second.close();
      await fixture.cleanup();
    }
  });
}

test("supports keyboard and a narrow screen while blocking pending navigation and repeated ratings", async ({
  page,
}, testInfo) => {
  const fixture = await createReviewFixture(2);
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/flashcards/cards/*/review", async (route) => {
      requests++;
      await released;
      await route.continue();
    });
    await openReview(page, fixture.setId);
    await page.getByRole("button", { name: "Show answer" }).focus();
    await page.keyboard.press("Enter");
    const rate = page.getByRole("button", { name: "Don't know — 24 hours", exact: true });
    await expect(rate).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Exit review", exact: true })).toBeDisabled();
    await expect(rate).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect.poll(() => requests).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("narrow-review-pending.png"), fullPage: true });
    release();
    await expect(page.getByRole("heading", { name: fixture.cards[1].question, exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("narrow-review-next.png"), fullPage: true });
  } finally {
    release();
    await fixture.cleanup();
  }
});

test("stops on an expired authentication session", async ({ page }) => {
  const fixture = await createReviewFixture();
  try {
    await page.route("**/api/flashcards/cards/*/review", async (route) =>
      route.fulfill({ status: 401, json: { error: "Authentication required" } }),
    );
    await openReview(page, fixture.setId);
    await reveal(page);
    await page.getByRole("button", { name: "Hard — 72 hours", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("session expired");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/auth/signin");
    await expect(page.getByRole("button", { name: "Retry rating" })).toHaveCount(0);
    expect((await fixture.readCards())[0]).toEqual(fixture.cards[0]);
  } finally {
    await fixture.cleanup();
  }
});
