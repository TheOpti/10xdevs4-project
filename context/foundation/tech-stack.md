---
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
---

## Why this stack

Memoro is a small TypeScript web MVP to be built in three after-hours weeks, with authenticated users, private flashcard data, and AI-generated proposals. The recommended Astro + React + Supabase + Cloudflare starter provides typed conventions, PostgreSQL, authentication foundations, and Cloudflare Pages deployment with minimal setup. GitHub Actions will automatically deploy merged changes to main; the AI generation flow will be integrated with the selected model provider during implementation.
