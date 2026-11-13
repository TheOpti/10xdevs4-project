import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");
const { SUPABASE_URL: url, SUPABASE_KEY: key, E2E_USERNAME: email, E2E_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) throw new Error("Local Supabase and E2E credentials are required");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Concurrency tests require a loopback Supabase URL");
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authError } = await client.auth.signInWithPassword({ email, password });
if (authError) throw new Error("Could not sign in as the local E2E owner; run npm run seed:e2e-user");
const { data: setId, error: setError } = await client.rpc("create_flashcard_set_with_source", {
  set_title: `Review concurrency ${randomUUID()}`,
  set_source_text: "Isolated concurrency fixture",
});
assert.ifError(setError);
assert.equal(typeof setId, "string");

function rate(cardId, requestId, rating = "hard") {
  return client.rpc("rate_flashcard", {
    card_id: cardId,
    expected_revision: 0,
    rating,
    request_id: requestId,
  });
}

async function cardState(id) {
  const { data, error } = await client.from("flashcards").select("revision, due_at").eq("id", id).single();
  assert.ifError(error);
  return data;
}

try {
  const { data: cards, error } = await client.rpc("save_reviewed_flashcards", {
    set_id: setId,
    request_id: randomUUID(),
    cards: Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i}`, answer: `Answer ${i}` })),
  });
  assert.ifError(error);
  assert.equal(cards.length, 4);

  const distinct = await Promise.all([rate(cards[0].id, randomUUID()), rate(cards[0].id, randomUUID())]);
  assert.equal(distinct.filter((result) => !result.error).length, 1, "One distinct request must win");
  assert.equal(distinct.find((result) => result.error)?.error.code, "P0001");
  assert.equal((await cardState(cards[0].id)).revision, 1);
  console.log("PASS: concurrent distinct requests apply one rating");

  const sameKey = randomUUID();
  const identical = await Promise.all([rate(cards[1].id, sameKey), rate(cards[1].id, sameKey)]);
  for (const result of identical) assert.ifError(result.error);
  assert.deepEqual(identical[0].data, identical[1].data, "Identical requests must return the same receipt");
  assert.equal((await cardState(cards[1].id)).revision, 1);
  const replay = await rate(cards[1].id, sameKey);
  assert.ifError(replay.error);
  assert.deepEqual(replay.data, identical[0].data, "Replay must preserve the timestamp and revision");
  console.log("PASS: simultaneous identical requests and replay preserve one receipt");

  const collisionKey = randomUUID();
  const collision = await Promise.all([rate(cards[2].id, collisionKey), rate(cards[3].id, collisionKey)]);
  assert.equal(collision.filter((result) => !result.error).length, 1);
  assert.equal(collision.find((result) => result.error)?.error.code, "P0001");
  const states = await Promise.all([cardState(cards[2].id), cardState(cards[3].id)]);
  assert.deepEqual(states.map((state) => state.revision).sort(), [0, 1]);
  console.log("PASS: request-key collision across cards changes only the winner");
} finally {
  const { error } = await client.from("flashcard_sets").delete().eq("id", setId);
  assert.ifError(error);
  await client.auth.signOut();
}
