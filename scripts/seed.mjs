import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const LEGACY_SQL_SEED_OWNER_ID = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER_ID = "66666666-6666-6666-6666-666666666666";
const SEED_OWNER_EMAIL = "seeded-owner@gmail.com";
const SEED_OWNER_PASSWORD = "Seeded-Password1!";
const executeFile = promisify(execFile);

async function getLocalSupabaseCredentials() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const args = isWindows ? ["/d", "/s", "/c", "npx supabase status -o env"] : ["supabase", "status", "-o", "env"];
  const { stdout } = await executeFile(command, args, { windowsHide: true });
  const values = Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match) => match)
      .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]),
  );

  if (!values.API_URL || !values.SERVICE_ROLE_KEY) {
    throw new Error("Could not get local Supabase credentials. Start the local stack with `npx supabase start` first.");
  }

  return { url: values.API_URL, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

const { url: supabaseUrl, serviceRoleKey } = await getLocalSupabaseCredentials();
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function throwIfError(error, action) {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

// Remove the old SQL fixture's records once. Its auth row was deliberately incomplete, so the
// Auth Admin API cannot delete it; only its public mock data needs cleanup.
const { error: deleteLegacyDataError } = await admin
  .from("flashcard_sets")
  .delete()
  .eq("owner_id", LEGACY_SQL_SEED_OWNER_ID);
throwIfError(deleteLegacyDataError, "Could not remove legacy SQL mock data");

const { error: deleteError } = await admin.auth.admin.deleteUser(SEED_OWNER_ID);
if (deleteError && !/user not found/i.test(deleteError.message)) {
  throwIfError(deleteError, "Could not remove existing mock user");
}

const { error: createUserError } = await admin.auth.admin.createUser({
  id: SEED_OWNER_ID,
  email: SEED_OWNER_EMAIL,
  password: SEED_OWNER_PASSWORD,
  email_confirm: true,
  user_metadata: { display_name: "Seeded owner" },
});
throwIfError(createUserError, "Could not create mock user");

const { error: createSetError } = await admin.from("flashcard_sets").insert({
  id: "22222222-2222-2222-2222-222222222222",
  owner_id: SEED_OWNER_ID,
  title: "Polish vocabulary basics",
});
throwIfError(createSetError, "Could not create mock set");

const { error: createSourceError } = await admin.from("flashcard_sources").insert({
  id: "33333333-3333-3333-3333-333333333333",
  set_id: "22222222-2222-2222-2222-222222222222",
  owner_id: SEED_OWNER_ID,
  source_text: "Dzień dobry means good morning or good day. Dziękuję means thank you. Do widzenia means goodbye.",
});
throwIfError(createSourceError, "Could not create mock source");

const { error: createCardsError } = await admin.from("flashcards").insert([
  {
    id: "44444444-4444-4444-4444-444444444444",
    set_id: "22222222-2222-2222-2222-222222222222",
    question: "What does ‘Dziękuję’ mean?",
    answer: "Thank you.",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    set_id: "22222222-2222-2222-2222-222222222222",
    question: "What does ‘Do widzenia’ mean?",
    answer: "Goodbye.",
  },
]);
throwIfError(createCardsError, "Could not create mock cards");

console.log(`Seeded ${SEED_OWNER_EMAIL}. Password: ${SEED_OWNER_PASSWORD}`);
