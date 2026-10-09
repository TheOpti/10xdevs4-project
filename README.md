# Memoro

Memoro is an Astro server-rendered application with React islands, Tailwind CSS,
and Supabase authentication. It is deployed to Cloudflare Workers at
[memoro.theopti.workers.dev](https://memoro.theopti.workers.dev).

## Stack

- Astro 7 with TypeScript and React
- Tailwind CSS
- Supabase Auth (server-side through `@supabase/ssr`)
- Cloudflare Workers and the `@astrojs/cloudflare` adapter

## Clone and run locally

### Prerequisites

- Node.js **24.21.0** (the version is pinned in `.nvmrc`)
- npm
- A Supabase project, or Docker Desktop plus the Supabase CLI for a fully local
  Supabase instance

```sh
git clone <repository-url>
cd 10xdevs4-project
npm ci
```

Copy `.env.example` to `.env`, then supply the project URL and its
**anon/publishable** key:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-or-publishable-key>
```

Never use a Supabase `service_role` key here. These values are read only on the
server through Astro's server environment interface; do not expose them in
client-side code. `.env` is Git-ignored and must stay that way.

Start the development server:

```sh
npm run dev
```

The app runs at `http://localhost:4321` by default.

### Local Supabase (optional)

With Docker Desktop running, start the checked-in local Supabase stack:

```sh
supabase start
supabase status -o env
```

Put the reported `API_URL` into `SUPABASE_URL` and `ANON_KEY` into
`SUPABASE_KEY` in `.env`. Stop the stack with `supabase stop --no-backup` when
finished.

To load the idempotent local mock data, run:

```sh
npm run seed
```

It creates `seeded-owner@gmail.com` (password: `Seeded-Password1!`) and a
small flashcard set. Each run removes and recreates that mock user's records;
it never needs a service-role key in `.env`. The command refuses non-local
Supabase URLs by default. Set `ALLOW_REMOTE_SEED=true` only for an intentional
remote seed with externally supplied service-role credentials.

## Authentication setup

The app uses email/password authentication. For a hosted Supabase project:

1. Enable email sign-ups and email confirmation in **Authentication → Providers
   → Email**.
2. In **Authentication → URL Configuration**, set the production Site URL to
   `https://memoro.theopti.workers.dev`.
3. Add `https://memoro.theopti.workers.dev` to Redirect URLs. Add
   `http://localhost:4321` for local development.

Supabase uses the Site URL as the default destination after an email
confirmation because this application does not provide a custom `redirectTo`
value during sign-up.

Protected paths are defined centrally in `src/middleware.ts`. Add a URL prefix
there when introducing a protected route; do not duplicate auth guards in pages.

## Validate changes

Run these before opening a pull request or deploying:

```sh
npm run lint
npx astro check
npm run build
```

`npm run format` applies the repository's Prettier rules. The GitHub Actions
workflow runs the same lint, type-check, build, and local-Supabase smoke-test
flow on `master` pull requests and pushes.

## End-to-end tests (Playwright)

E2E tests require Docker Desktop and the local Supabase stack. Start it with
`npx supabase start`, then configure `.env` with its local API URL and anon key
as described above. Install the browser once:

```sh
npx playwright install chromium
```

Create a Git-ignored `.env.e2e` in the project root:

```dotenv
E2E_USERNAME=e2e-test@local.test
E2E_PASSWORD=<choose-a-local-test-password>
```

Run the suite or open the interactive test runner:

```sh
npx playwright test
npx playwright test --ui
```

Playwright builds and starts the app preview at `http://localhost:4321`, or
reuses an existing server locally. Set `E2E_PORT` to use another port. Any
reused server must also point to the local Supabase stack. `npm test` runs
Vitest; Playwright is run separately.

### Local test user and saved session

Before tests run, `tests/e2e/global-setup.ts` calls
`scripts/seed-e2e-user.mjs`. This is a global setup hook, so user creation does
not appear as a separate test in the UI. To run it manually, use
`npm run seed:e2e-user`.

The script uses `E2E_USERNAME` and `E2E_PASSWORD` to prepare a confirmed local
Supabase account. If the email already exists, it preserves the user's ID and
data, updates the password, and ensures email confirmation. Otherwise, it
creates the account. Repeated runs reuse the account rather than creating
duplicates; they do not clear its application data. The current lookup checks
the first 1,000 users. The script refuses non-local Supabase URLs and obtains
the local service-role key from the Supabase CLI; do not add it to `.env`.

Next, the `setup` project runs `tests/e2e/auth.setup.ts`, signs in through the
app, and saves the browser session to `playwright/.auth/user.json`. The
`chromium` project depends on this setup and loads that storage state into
each test's browser context, so new `*.spec.ts` tests start signed in without
repeating the login flow. Browser contexts are isolated, but the account and
its database records are shared; tests must clean up data they create.

For a test that needs a signed-out visitor, override the saved state, as in
`tests/e2e/seed.spec.ts`:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

In UI mode, enable both `setup` and `chromium` in the Projects filter. Run
**sign in once and save the session** before the browser tests, and rerun it
when the session expires: UI mode does not automatically run project
dependencies. Keep `.env.e2e` and `playwright/.auth/` out of Git; both are
already ignored.

### Production and staging

The E2E global setup runs only when Playwright is launched. Building,
deploying, or starting the production app does not run it or create the E2E
user. Production users use the app's normal signup and sign-in flow.

The current Playwright configuration targets localhost, and the user seed
rejects non-local Supabase URLs. Running Playwright with `SUPABASE_URL`
pointing to production therefore fails during setup.

Testing a deployed app requires additional configuration. Use a separate
staging environment with a dedicated test account; the current E2E setup
supports local testing only.

## Deploy to Cloudflare Workers

The Worker configuration is in `wrangler.jsonc`; its deployed name is `memoro`.
The first deployment automatically provisions the adapter's `SESSION` KV
namespace and `IMAGES` binding.

1. Authenticate with an account that can deploy Workers:

   ```sh
   npx wrangler login
   npx wrangler whoami
   ```

   Alternatively, set `CLOUDFLARE_API_TOKEN` in your local shell or ignored
   `.env` file. Keep the token out of Git and grant it only the Worker
   permissions it needs.

2. Run the validation commands above, then publish:

   ```sh
   npx wrangler deploy
   ```

3. After the first deploy creates the Worker, add the Supabase values as
   encrypted Worker secrets. Wrangler prompts for each value; do not paste them
   into source files or command history.

   ```sh
   npx wrangler secret put SUPABASE_URL --name memoro
   npx wrangler secret put SUPABASE_KEY --name memoro
   ```

4. Verify the public home page, anonymous `/dashboard` redirect, sign-in with a
   confirmed test account, authenticated dashboard access, and sign-out.

Useful operational commands:

```sh
npx wrangler secret list --name memoro
npx wrangler tail memoro --format json
npx wrangler deployments list --name memoro
npx wrangler rollback <version-id>
```

Deployments are manual; GitHub Actions validates the project but does not
publish it.

## Project layout

```text
src/pages/            Astro routes and auth API endpoints
src/components/       Astro components and React auth islands
src/lib/              Shared server utilities, including Supabase client setup
src/middleware.ts     Central authentication and route protection
src/styles/           Global styles
supabase/             Local Supabase configuration and migrations
context/foundation/   Product, stack, and infrastructure decisions
```

`context/archive/` is historical material and must not be modified.
