---
bootstrapped_at: 2026-09-18T11:21:53.5087946Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: memoro
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: memoro
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

## Why this stack

Memoro is a small TypeScript web MVP to be built in three after-hours weeks, with authenticated users, private flashcard data, and AI-generated proposals. The recommended Astro + React + Supabase + Cloudflare starter provides typed conventions, PostgreSQL, authentication foundations, and Cloudflare Pages deployment with minimal setup. GitHub Actions will automatically deploy merged changes to main; the AI generation flow will be integrated with the selected model provider during implementation.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | The selected command clones a Git repository, so no npm create-package applies. |
| GitHub repo | not run | n/a | GitHub CLI (`gh`) is not installed locally. |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries
**Conflicts (.scaffold siblings)**: `AGENTS.md.scaffold`, `README.md.scaffold`
**.gitignore handling**: append-merged
**.bootstrap-scaffold cleanup**: deleted

The upstream `.git/` directory was removed before merging, preserving the existing repository history in the current directory.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished by this audit because there were no findings

No vulnerable packages were reported. Dependency metadata: 360 production, 269 development, 165 optional, 25 peer; 802 total.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review `.scaffold` siblings and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance; the full breakdown is in this log.
