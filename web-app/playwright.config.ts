import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the MSME Marketplace web app.
 *
 * These tests run against the real local dev stack (Postgres + Django +
 * FastAPI + this Next.js app) — there's no mocked backend, matching the
 * "verify against real services" convention already used by the Django and
 * FastAPI test suites in this repo. That means:
 *
 *   1. All three backing services must already be running locally
 *      (`podman start msme-postgres`, `python manage.py runserver`,
 *      `uvicorn main:app --port 8001`, `pnpm dev`) before `pnpm test:e2e`.
 *   2. Tests write real rows to the local dev Postgres. Specs that need
 *      their own users register fresh accounts with randomized emails per
 *      run (see `e2e/helpers.ts`) so re-runs don't collide.
 *   3. One thing tests do NOT bootstrap for themselves: an active `Vertical`
 *      with a `GradingSchema` (creating a vertical is admin-only, and admin
 *      accounts can't be self-registered — see
 *      `backend-django/accounts/tests.py:test_cannot_self_register_as_admin`).
 *      Specs that need one assume `agriculture` already exists, exactly the
 *      same tradeoff `backend-fastapi/tests/db_fixtures.py` already accepts
 *      for its own seed data.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
