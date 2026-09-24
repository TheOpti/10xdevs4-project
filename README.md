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

- Node.js **26.9.0** (the version is pinned in `.nvmrc`)
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
it never needs a service-role key in `.env`.

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
