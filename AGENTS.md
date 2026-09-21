# Repository Guidelines

This is an Astro 7 application deployed to Cloudflare, with React islands, Tailwind CSS, and Supabase-backed authentication. Source code lives in `src/`; product and stack decisions are maintained under `context/foundation/`.

## Critical rules

- Keep Supabase credentials server-only. Use `SUPABASE_URL` and `SUPABASE_KEY` through Astro's `astro:env/server` interface, following @src/lib/supabase.ts; never expose either value in client-side code.
- Route protection belongs in @src/middleware.ts. Add protected URL prefixes to `PROTECTED_ROUTES`; do not duplicate authentication checks independently in each page.
- Preserve the server-client contract for auth forms: React components submit to Astro `POST` endpoints in `src/pages/api/auth/`, and endpoints redirect with URL-encoded `error` query parameters.
- Do not modify files beneath `context/archive/`; that directory is immutable historical material.

## Project structure

- `src/pages/` contains file-based Astro routes, including `auth/` pages and `api/auth/` endpoints. Use @src/pages/index.astro and @src/pages/api/auth/signin.ts as route patterns.
- `src/components/` holds Astro UI, while interactive auth controls are colocated in `src/components/auth/` as `.tsx` React components. Reusable primitives live in `src/components/ui/`.
- `src/lib/` contains shared server and utility code; use the `@/` alias for imports rooted at `src/`.
- `src/styles/global.css` is the global stylesheet. @context/foundation/prd.md and @context/foundation/tech-stack.md are the canonical planning references.

## Build, lint, and validation

- `npm run dev` starts the Astro development server.
- `npm run lint` runs ESLint across the repository; run it after TypeScript, React, or Astro edits.
- `npx astro check` validates Astro and TypeScript types, as required by CI.
- `npm run build` creates the Cloudflare server build; set the Supabase variables when exercising configured auth locally.
- `npm run smoke` checks a running preview. CI builds then runs it against local Supabase; see @.github/workflows/ci.yml.

## Code style and tests

Prettier enforces two-space indentation, double quotes, semicolons, 120-column wrapping, and Tailwind class ordering; run `npm run format` for formatting changes. ESLint uses strict type-aware TypeScript rules. Prefix intentionally unused variables and parameters with `_` to satisfy the unused-variable rule. There is no standalone unit-test runner: CI gates changes with linting, `astro check`, a production build, and the preview smoke test.

## Commits and pull requests

Recent commits use short imperative subjects, for example `Create skeleton of the project`; follow that style. Before opening a PR, run the CI-equivalent lint, type check, and build commands. Describe user-visible route or authentication changes and identify any required Supabase configuration.
