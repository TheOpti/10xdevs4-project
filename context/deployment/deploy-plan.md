# First deployment of Memoro on Cloudflare Workers

## Summary

Deploy the existing Astro SSR application manually to Cloudflare Workers under
`memoro.<account-subdomain>.workers.dev`. Cloudflare Workers overrides the stale
`cloudflare-pages` hint in `tech-stack.md`, because `infrastructure.md` and the
current Astro/Wrangler configuration explicitly select Workers.

## Prerequisites checklist

Complete this checklist before the release gate. Do not paste credentials into the
terminal transcript, source files, or Git.

### Local workstation

- [ ] Node.js 26.9 and npm are available: `node --version` and `npm --version`.
- [ ] Dependencies install reproducibly: `npm ci` succeeds from the repository
  root.
- [ ] Wrangler is available at the version pinned by the project:
  `npx wrangler --version`.
- [ ] Supabase CLI is available: `supabase --version`.
- [ ] Docker Desktop is installed and running if local Supabase smoke tests will
  be run: `docker info` succeeds. Docker is required for `supabase start`, not for
  publishing the Worker itself.

### Cloudflare account and Worker access

- [ ] The intended Cloudflare account is active and has permission to create and
  deploy Workers.
- [ ] `npx wrangler login` has completed in the browser, and `npx wrangler whoami`
  identifies the intended account.
- [ ] The account has a `workers.dev` subdomain enabled, so the planned
  `memoro.<account-subdomain>.workers.dev` address can be issued.
- [ ] The person or token used for deployment has only the required project/account
  Worker permissions; it has no unnecessary DNS, billing, or unrelated-secret
  access.

### Supabase production project

- [ ] The existing production project is active and its region is appropriate for
  the initial users.
- [ ] Supabase Auth is enabled, email/password sign-up is enabled, and email
  confirmation remains enabled.
- [ ] Auth redirect URLs include the future `workers.dev` URL (and the local URL
  needed for development, if applicable).
- [ ] The required application schema, Row Level Security policies, and migration
  history have been applied to the production database; a confirmed test user can
  sign in and access only its own data.
- [ ] The project URL and **anon/publishable key** have been retrieved through the
  Supabase dashboard or CLI and are ready to enter as Worker secrets. Do not use a
  `service_role` key for the application’s normal user requests.
- [ ] `SUPABASE_URL` and `SUPABASE_KEY` have been set in Cloudflare only with
  `npx wrangler secret put`; verify the values are not present in Git, `.env`
  files intended for commit, browser variables, or logs.

## Implementation changes

- Update `context/foundation/tech-stack.md` so `deployment_target` is
  `cloudflare-workers`, keeping the planning contracts consistent.
- Change `wrangler.jsonc` Worker name from `10x-astro-starter` to `memoro`; retain
  the Astro Worker entry point, assets binding, `nodejs_compat`, and observability
  settings.
- Do not add deployment automation or preview infrastructure. Existing GitHub
  Actions remains validation-only for `master`.
- Do not change application routes, Supabase client code, or expose secrets to
  client code.

## Deployment procedure

1. A human authenticates Wrangler with the intended Cloudflare account and confirms
   the generated `memoro.<account-subdomain>.workers.dev` address.
2. A human configures the existing production Supabase project: email confirmation
   remains enabled, redirect URLs include the Workers URL, and a confirmed test
   account is available.
3. Add `SUPABASE_URL` and `SUPABASE_KEY` as Cloudflare Worker secrets using
   `wrangler secret put`; never commit them or add them as public variables.
4. Run the release gate locally: `npm ci`, `npx astro sync`, `npm run lint`,
   `npx astro check`, and `npm run build`.
5. Publish with `npx wrangler deploy`; retain the returned deployment version and
   Worker URL.
6. Verify manually on the deployed URL: public home page, anonymous dashboard
   redirect, sign-in with the confirmed test account, authenticated dashboard
   access, and sign-out. The current smoke test is not used against production
   because it expects immediate sign-in after registration.
7. Inspect runtime logs with `npx wrangler tail memoro --format json`. If the
   release fails, use `npx wrangler rollback <known-good-version>` and repair any
   incompatible Supabase change forward.

## Test plan

- Confirm the CI-equivalent validation commands pass before publication.
- Confirm the deployed Worker receives Supabase secrets without exposing either
  value in browser assets.
- Confirm login behavior respects enabled email confirmation.
- Confirm the deployed application has no Worker runtime compatibility errors in
  logs.
- Confirm rollback restores the prior Worker version; no database migration is
  included in this release.

## Assumptions

- Deployment is manual and production-only; no PR preview Worker or deployment CI
  is created.
- The existing Supabase project is the production data and authentication source.
- Email confirmation stays enabled.
- A custom domain, LLM integration, database migrations, and CI/CD deployment
  automation are outside this first-deployment plan.
