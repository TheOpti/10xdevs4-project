import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface FlashcardFixtureOptions {
  withCard?: boolean;
  tags?: string[];
  titlePrefix?: string;
}

export interface FlashcardFixture {
  setId: string;
  title: string;
  tags: string[];
  cleanup: () => Promise<void>;
}

export interface CatalogFixtureCollection {
  sets: FlashcardFixture[];
  cleanup: () => Promise<void>;
}

function getLocalSupabaseClient() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  const email = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!url || !key || !email || !password) throw new Error("Local Supabase and E2E credentials are required");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("E2E fixtures require local Supabase");
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { client, email, password };
}

export async function createFlashcardFixture(
  options: boolean | FlashcardFixtureOptions = true,
): Promise<FlashcardFixture> {
  const { client, email, password } = getLocalSupabaseClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error("Could not sign in as the E2E owner");

  const withCard = typeof options === "boolean" ? options : (options.withCard ?? true);
  const tags = typeof options === "object" && options.tags ? options.tags : [];
  const titlePrefix = typeof options === "object" && options.titlePrefix ? options.titlePrefix : "Saved card editing";
  const title = `${titlePrefix} ${randomUUID()}`;

  const { data: setId, error: createError } = await client
    .rpc("create_flashcard_set_with_source", { set_title: title, set_source_text: "Private E2E source" })
    .overrideTypes<string, { merge: false }>();
  if (createError || typeof setId !== "string" || !setId) throw new Error("Could not create the E2E set");

  async function cleanup() {
    const { error } = await client.from("flashcard_sets").delete().eq("id", setId);
    if (error) throw new Error("Could not clean up the E2E set");
  }

  if (tags.length > 0) {
    const { error: tagError } = await client.from("flashcard_sets").update({ tags }).eq("id", setId);
    if (tagError) {
      await cleanup();
      throw new Error("Could not assign tags to the E2E set");
    }
  }

  const { error: saveError } = withCard
    ? await client.rpc("save_reviewed_flashcards", {
        set_id: setId,
        request_id: randomUUID(),
        cards: [{ question: "Fixture question", answer: "Fixture answer" }],
      })
    : { error: null };
  if (saveError) {
    await cleanup();
    throw new Error("Could not save the E2E card");
  }
  return { setId, title, tags, cleanup };
}

export async function createCatalogFixtureCollection(
  definitions: FlashcardFixtureOptions[],
): Promise<CatalogFixtureCollection> {
  const { client, email, password } = getLocalSupabaseClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error("Could not sign in as the E2E owner");

  const createdSetIds: string[] = [];
  const sets: FlashcardFixture[] = [];

  async function cleanupAll() {
    if (createdSetIds.length > 0) {
      const { error } = await client.from("flashcard_sets").delete().in("id", createdSetIds);
      if (error) throw new Error("Could not clean up the catalog E2E sets");
    }
  }

  try {
    for (const def of definitions) {
      const withCard = def.withCard ?? true;
      const tags = def.tags ?? [];
      const titlePrefix = def.titlePrefix ?? "Catalog fixture";
      const title = `${titlePrefix} ${randomUUID()}`;

      const { data: setId, error: createError } = await client
        .rpc("create_flashcard_set_with_source", { set_title: title, set_source_text: "Private E2E source" })
        .overrideTypes<string, { merge: false }>();
      if (createError || typeof setId !== "string" || !setId) throw new Error("Could not create the E2E set");
      createdSetIds.push(setId);

      if (tags.length > 0) {
        const { error: tagError } = await client.from("flashcard_sets").update({ tags }).eq("id", setId);
        if (tagError) throw new Error("Could not assign tags to the E2E set");
      }

      if (withCard) {
        const { error: saveError } = await client.rpc("save_reviewed_flashcards", {
          set_id: setId,
          request_id: randomUUID(),
          cards: [{ question: "Fixture question", answer: "Fixture answer" }],
        });
        if (saveError) throw new Error("Could not save the E2E card");
      }

      sets.push({
        setId,
        title,
        tags,
        cleanup: async () => {
          await client.from("flashcard_sets").delete().eq("id", setId);
        },
      });
    }

    return { sets, cleanup: cleanupAll };
  } catch (error) {
    await cleanupAll();
    throw error;
  }
}
