import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

export async function createFlashcardFixture(withCard = true) {
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
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error("Could not sign in as the E2E owner");
  const title = `Saved card editing ${randomUUID()}`;
  const { data: setId, error: createError } = await client
    .rpc("create_flashcard_set_with_source", { set_title: title, set_source_text: "Private E2E source" })
    .overrideTypes<string, { merge: false }>();
  if (createError || typeof setId !== "string" || !setId) throw new Error("Could not create the E2E set");
  async function cleanup() {
    const { error } = await client.from("flashcard_sets").delete().eq("id", setId);
    if (error) throw new Error("Could not clean up the E2E set");
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
  return { setId, title, cleanup };
}
