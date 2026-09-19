import { expect, test } from "@playwright/test";

import { loginViaUi, registerAndLogin, uniqueEmail } from "./helpers";

test.describe("Registration and login", () => {
  test("a buyer can register through the real form and lands on the buyer dashboard", async ({ page }) => {
    const email = uniqueEmail("buyer-ui");
    const password = "E2ePassword123";

    await page.goto("/register");
    await page.getByLabel("Full name").fill("E2E Test Buyer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    // "I am a" defaults to Buyer — see app/(auth)/register/page.tsx.
    await page.getByRole("button", { name: "Create account" }).click();

    // Register submits registration + login + /auth/me in sequence client-side.
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
  });

  test("a seller registered via the API can log in through the real UI and lands on their dashboard", async ({
    page,
    request,
  }) => {
    const { email, password } = await registerAndLogin(request, "SELLER", "seller-ui");

    await loginViaUi(page, email, password);

    // Sellers share the buyer console shell (lib/auth.ts:dashboardPathForRole)
    // — there's no separate seller web UI, that's the deferred Android app.
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
  });

  test("an unauthenticated visitor hitting a protected route is redirected to login", async ({ page }) => {
    await page.goto("/buyer/orders");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password shows a real 401-driven error, not a silent failure", async ({ page, request }) => {
    const { email } = await registerAndLogin(request, "BUYER", "badpw");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    // Next.js's own route announcer (`#__next-route-announcer__`) also has
    // role="alert", so scope past it rather than using getByRole("alert").
    await expect(page.locator('p[role="alert"]')).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL(/\/login/);
  });
});
