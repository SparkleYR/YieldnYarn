import type { APIRequestContext, Page } from "@playwright/test";

export const DJANGO_API_URL = process.env.PLAYWRIGHT_DJANGO_API_URL ?? "http://localhost:8000/api";
export const FASTAPI_URL = process.env.PLAYWRIGHT_FASTAPI_URL ?? "http://localhost:8001/compute";

/** Unique per test run so re-running the suite never collides on `email` uniqueness. */
export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export type Role = "BUYER" | "SELLER" | "VERIFIER";

export interface RegisteredUser {
  email: string;
  password: string;
  role: Role;
  access: string;
  refresh: string;
}

/**
 * Registers a fresh user directly against the real Django API (faster and
 * more reliable than driving the signup form for setup that isn't itself
 * under test) and logs in, returning a usable JWT pair.
 */
export async function registerAndLogin(request: APIRequestContext, role: Role, prefix: string): Promise<RegisteredUser> {
  const email = uniqueEmail(prefix);
  const password = "E2ePassword123";

  const registerRes = await request.post(`${DJANGO_API_URL}/auth/register/`, {
    data: { email, password, role },
  });
  if (!registerRes.ok()) {
    throw new Error(`Registration failed for ${email}: ${registerRes.status()} ${await registerRes.text()}`);
  }

  const loginRes = await request.post(`${DJANGO_API_URL}/auth/login/`, {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    throw new Error(`Login failed for ${email}: ${loginRes.status()} ${await loginRes.text()}`);
  }
  const tokens = (await loginRes.json()) as { access: string; refresh: string };

  return { email, password, role, ...tokens };
}

/**
 * Logs a registered user into the actual browser UI via the real login form
 * (not a localStorage shortcut) and waits for the role-based dashboard
 * redirect, so tests exercise the real auth flow at least once per session.
 */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(buyer|admin|verifier)\/dashboard/);
  // waitForURL only confirms the client-side route changed — global keyboard
  // shortcuts (e.g. the command palette's Ctrl/Cmd+K listener) attach in a
  // useEffect that hasn't necessarily run yet at that point, so callers that
  // immediately send a keyboard shortcut need the page to be settled first.
  await page.getByRole("heading", { name: "Dashboard" }).first().waitFor();
}

/**
 * Creates a listing as the given seller (via the real Django API — there is
 * no seller-facing UI for this yet, the seller app is a separate, not-yet-
 * built deferred phase) and triggers grading through the real FastAPI
 * compute service, exactly like `ListingActions`/the (future) seller app
 * would. Returns the listing id and whatever status it landed in.
 */
export async function createAndGradeListing(
  request: APIRequestContext,
  sellerAccess: string,
  params: { verticalId: number; commodityName: string; quantity: number; unit: string; priceSuggested: number }
) {
  const createRes = await request.post(`${DJANGO_API_URL}/catalog/listings/`, {
    headers: { Authorization: `Bearer ${sellerAccess}` },
    data: {
      vertical: params.verticalId,
      commodity_name: params.commodityName,
      quantity: params.quantity,
      unit: params.unit,
      price_suggested: params.priceSuggested,
      price_final: params.priceSuggested,
    },
  });
  if (!createRes.ok()) {
    throw new Error(`Listing create failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const listing = (await createRes.json()) as { id: number; status: string };

  const gradeRes = await request.post(`${DJANGO_API_URL}/catalog/listings/${listing.id}/grading/trigger/`, {
    headers: { Authorization: `Bearer ${sellerAccess}` },
  });
  if (!gradeRes.ok()) {
    throw new Error(`Grading trigger failed: ${gradeRes.status()} ${await gradeRes.text()}`);
  }

  const detailRes = await request.get(`${DJANGO_API_URL}/catalog/listings/${listing.id}/`, {
    headers: { Authorization: `Bearer ${sellerAccess}` },
  });
  const detail = (await detailRes.json()) as { id: number; status: string };
  return detail;
}

/** The `agriculture` vertical seeded by earlier manual/admin sessions — see playwright.config.ts's top-of-file note on why tests don't create their own. */
export async function getAgricultureVertical(request: APIRequestContext, access: string) {
  const res = await request.get(`${DJANGO_API_URL}/config/verticals/?is_active=true`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok()) {
    throw new Error(`Could not list verticals: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { results: { id: number; slug: string }[] };
  const agriculture = body.results.find((v) => v.slug === "agriculture");
  if (!agriculture) {
    throw new Error(
      "No 'agriculture' vertical found. This test suite assumes one already exists in the dev DB " +
        "(created once via /admin/verticals) — see playwright.config.ts's top-of-file comment."
    );
  }
  return agriculture;
}
