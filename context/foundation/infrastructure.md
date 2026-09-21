---
project: Memoro
researched_at: 2026-09-21
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3.2 with React 19.2.6
  runtime: Cloudflare Workers with @astrojs/cloudflare 14.3.1
---

## Recommendation

**Deploy on Cloudflare Workers.**

The repository already targets Workers: it uses `@astrojs/cloudflare` 14.3.1, `output: "server"`, `nodejs_compat`, and a Wrangler entry point for the Astro server. The MVP has low traffic, does not need persistent processes, can use external Supabase services, and has roughly equal cost and developer-experience priorities. Workers therefore avoids an adapter and runtime migration while its free allowance comfortably covers the expected 10k-100k monthly requests. Workers—not legacy Pages—is the correct target for the current SSR setup. [Astro deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Platform Comparison

Scores evaluate agent-operability; runtime/configuration migration is noted separately.

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Scriptable deployment | MCP / integration | Total | Outcome |
|---|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5/5 | Recommended |
| Netlify | Pass | Pass | Pass | Pass | Pass | 5/5 | Runner-up |
| Vercel | Pass | Pass | Pass | Pass | Partial — MCP is beta | 4.5/5 | Third |
| Fly.io | Pass | Partial | Pass | Pass | Partial — MCP deployment material is beta | 3.5/5 | Not shortlisted |
| Railway | Partial — arbitrary rollback needs dashboard | Partial | Pass | Partial | Pass | 3/5 | Not shortlisted |
| Render | Partial — rollback is dashboard/API | Pass | Pass | Partial | Pass | 3.5/5 | Not shortlisted |

### Assessment notes

- **Cloudflare Workers:** the exact pinned Astro adapter and Wrangler 4 workflow already match the deployment target. `wrangler deploy`, `wrangler tail`, and `wrangler rollback` are deterministic CLI operations. Workers provides D1, KV, R2, Queues, and Durable Objects, though the MVP keeps Supabase external. The official remote Cloudflare MCP servers are documented without a beta label. [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) · [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- **Netlify:** excellent previews, CLI, Markdown/LLM-facing docs, and an official MCP offering; its $0 plan uses a 300-credit hard monthly limit. It supports Astro SSR, but requires replacing the current Cloudflare adapter with `@astrojs/netlify`, making it a less direct fit. It has no persistent server process, which is acceptable here. [Astro on Netlify](https://docs.astro.build/en/guides/deploy/netlify/) · [credit pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
- **Vercel:** strong CLI, previews, and Astro support, but SSR requires `@astrojs/vercel`; it cannot reuse the current Cloudflare adapter. Its MCP is **beta** as checked on 2026-09-21. Hobby is intended for personal/non-commercial use, another MVP constraint to confirm. [Astro on Vercel](https://vercel.com/docs/frameworks/frontend/astro) · [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp)
- **Fly.io:** supports persistent Machines and WebSockets, but requires a Node adapter plus container/Machine configuration. It has no ongoing free tier and its MCP deployment guidance is **beta**, capability the MVP does not need. [Astro on Fly](https://fly.io/docs/js/frameworks/astro/) · [pricing](https://fly.io/docs/about/pricing/)
- **Railway:** can run Astro as a Node application, but requires an adapter migration. The CLI supports deploy and logs, while rollback to a chosen deployment remains dashboard-only. Its free period is a trial; always-on SSR normally needs the paid Hobby plan. [Railway deploy CLI](https://docs.railway.com/cli/deploying) · [pricing](https://railway.com/pricing)
- **Render:** Astro SSR works with the Node adapter, not the current Cloudflare adapter. Its free web service spins down after idle time and may cold-start for about a minute, making it a weak authenticated-app target. [Render Astro guide](https://render.com/docs/deploy-astro) · [free-instance limits](https://render.com/docs/free)

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

It wins because the application already has the exact adapter, Wrangler configuration, and compatibility flag required for Workers. The free request allowance, managed edge runtime, first-party observability, CLI, and MCP support meet the MVP's cost, speed, and agent-operability requirements without changing the application runtime.

#### 2. Netlify

Netlify has strong agent-facing operations and a reasonable free tier for a small MVP. It falls behind only because moving this SSR app would require changing the adapter and validating its server/runtime behavior before deployment.

#### 3. Vercel

Vercel is a capable alternative with polished preview deployments, but requires the same adapter migration and its MCP offering is beta. Its Hobby-plan usage conditions are also less neutral for a future commercial product.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Workers is not a full Node.js runtime. A future AI SDK or transitive Supabase dependency can build successfully but fail at runtime if it needs an unsupported Node API.
2. The Workers Free plan allows 10 ms CPU time per request. CPU-heavy text normalisation or retry loops around AI generation can exceed it even at low request volume.
3. Rolling back a Worker does not roll back Supabase schema migrations or stored data, so an application rollback can leave incompatible database state.
4. Server-side rendering makes each authenticated request depend on network latency to the selected Supabase region.
5. Cloudflare-specific bindings and APIs increase migration cost if the team later needs a conventional Node host.

### Pre-Mortem — How This Could Fail

Six months later the deployment decision is seen as a failure because compatibility was assumed rather than tested. The team added an AI-provider SDK whose Node dependency was unavailable in Workers. Local development looked normal, but the first production generation endpoint failed. A later fix moved too much cleanup and validation into the Worker request path, intermittently exceeding the free-plan CPU limit; the team upgraded the plan instead of adding budgets and observability. A faulty release was then rolled back successfully at the Worker layer, but its Supabase migration remained in place and the older code no longer understood the schema. Preview URLs used production-like credentials and leaked test data into the wrong Supabase project. Finally, Supabase was provisioned in a distant region, so SSR authentication and card retrieval felt slow even at low traffic. The individual failures were small, but missing production-runtime tests, migration discipline, preview isolation, and latency measurement turned them into a long-lived operational burden.

### Unknown Unknowns

- Astro 7.3.2 with `@astrojs/cloudflare` 14.3.1 is already a Workers workflow; use `npx wrangler deploy`, not a legacy `wrangler pages deploy` command.
- Retain `npm run dev` for routine development. Adding a separate Wrangler development command does not improve this project's documented local workflow.
- Configure separate Supabase projects or at least separate credentials for preview and production deployments.
- The Cloudflare API token used by Wrangler or MCP must be scoped to this single Worker; do not grant DNS, billing, or unrelated-secret permissions.
- Keep Astro, `@astrojs/cloudflare`, and Wrangler upgrades coordinated, and validate the deployed Worker before adopting a new major version.

## Operational Story

- **Preview deploys:** no PR preview automation exists yet. Until it is deliberately configured, publish a separate preview Worker with `npx wrangler deploy --name memoro-preview` and only non-production Supabase credentials; protect it before sharing externally.
- **Secrets:** store `SUPABASE_URL` and `SUPABASE_KEY` as Worker secrets via `npx wrangler secret put <NAME>`. Only project members with Cloudflare access should manage them; rotate by setting the replacement secret, deploying, verifying, then revoking the old Supabase key.
- **Rollback:** run `npx wrangler rollback <VERSION_ID>` after identifying a known-good version. The active Worker changes immediately; separately verify whether a Supabase migration or data change needs a forward repair.
- **Approval:** a human approves the first production publish, primary-secret rotation, database deletion, and database migration. An agent may build, deploy a preview, inspect versions, and read logs with a project-scoped token.
- **Logs:** use `npx wrangler tail 10x-astro-starter --format json` for read-only live logs, and `npx wrangler deployments list` to inspect deployment versions.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| Unsupported Node API in an AI or auth dependency | Devil's advocate | M | H | Add a deployed smoke test for sign-in and generation before every release; review Workers compatibility when adding SDKs. |
| CPU limit exceeded by request-path processing | Devil's advocate | M | M | Keep generation at the external provider, cap source size/card count, and measure Worker CPU before relying on the free plan. |
| App rollback conflicts with Supabase schema | Devil's advocate | M | H | Use additive, backwards-compatible migrations and a documented forward-fix procedure. |
| Preview accesses production data | Pre-mortem | M | H | Use separate preview credentials and never set production secrets on a preview Worker. |
| Poor SSR-to-Supabase latency | Pre-mortem | L | M | Choose a Supabase region near the intended user region and measure authenticated route latency after first deployment. |
| Excessive Cloudflare token scope | Unknown unknowns | M | H | Create a single-project, least-privilege token without DNS or billing access; rotate it if exposed. |
| Legacy Pages command used for SSR deploy | Research finding | M | M | Treat `npx wrangler deploy` as the canonical deployment command and preserve the existing Workers configuration. |

## Getting Started

1. Create or select a Cloudflare account and authenticate locally with `npx wrangler login`.
2. In the repository root, run `npm run build`; this uses the pinned Astro 7.3.2 and `@astrojs/cloudflare` 14.3.1 integration to create the Worker bundle.
3. Set production secrets interactively: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Never place those values in client code or commit them.
4. Publish the existing Workers configuration with `npx wrangler deploy`, then verify the assigned `workers.dev` URL, sign-in route, and a server-rendered authenticated page.
5. Inspect production behavior read-only with `npx wrangler tail 10x-astro-starter --format json`; record the first known-good deployment version for rollback.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture, including multi-region HA and disaster recovery
