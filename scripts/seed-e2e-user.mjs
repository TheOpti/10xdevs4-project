import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { URL } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireLocalUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);

  const url = new URL(value);
  if (!localHostnames.has(url.hostname)) {
    throw new Error(`${label} must point to a local Supabase stack`);
  }

  return url;
}

async function localSupabaseCredentials() {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx supabase status -o env"]
      : ["supabase", "status", "-o", "env"];
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

  requireLocalUrl(values.API_URL, "Local Supabase API URL");
  return { url: values.API_URL, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

requireLocalUrl(process.env.SUPABASE_URL, "SUPABASE_URL");

const email = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
if (!email || !password) {
  throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env.e2e");
}

const { url, serviceRoleKey } = await localSupabaseCredentials();
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`Could not list local users: ${listError.message}`);

const existingUser = data.users.find((user) => user.email === email);
const userResult = existingUser
  ? await admin.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true })
  : await admin.auth.admin.createUser({ email, password, email_confirm: true });

if (userResult.error) throw new Error(`Could not seed local E2E user: ${userResult.error.message}`);

console.log("Local E2E user is ready.");
