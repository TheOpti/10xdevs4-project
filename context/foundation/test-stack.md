# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/seed.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4321
- port: 4321 (detected from Astro preview default; override with E2E_PORT in .env.e2e)
- web server command: npm run build && npm run preview -- --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), after local-user seed (tests/e2e/seed-user.setup.ts); credentials from E2E_USERNAME / E2E_PASSWORD in .env.e2e
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects auth-gate-redirect: a signed-out visitor cannot reach the dashboard
- browser CLI: playwright-cli 0.1.22, command skill at .agents/skills/playwright-cli/
- updated: 2026-10-08
