import { expect, test } from "@playwright/test";

import { DJANGO_API_URL, loginViaUi, registerAndLogin } from "./helpers";

const TOKENS_KEY = "msme.auth.tokens"; // lib/auth.ts

test("an expired access token is renewed from the httpOnly refresh cookie without logging out", async ({
  page,
  request,
}) => {
  const { email, password } = await registerAndLogin(request, "BUYER", "refresh");
  await loginViaUi(page, email, password);
  await expect(page).toHaveURL(/\/buyer\/dashboard/);

  // The refresh token never reaches JS: only the access token is stored.
  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), TOKENS_KEY);
  expect(Object.keys(stored)).toEqual(["access"]);
  const cookies = await page.context().cookies();
  const refresh = cookies.find((c) => c.name === "msme_refresh");
  expect(refresh?.httpOnly).toBe(true);

  // Simulate the access token expiring, then use the app.
  await page.evaluate((key) => window.localStorage.setItem(key, JSON.stringify({ access: "expired" })), TOKENS_KEY);
  await page.goto("/buyer/orders");

  await expect(page).toHaveURL(/\/buyer\/orders/);
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").access, TOKENS_KEY))
    .not.toBe("expired");
});

test("logging out revokes the refresh cookie, so the session can't be revived", async ({ page, request }) => {
  const { email, password } = await registerAndLogin(request, "BUYER", "revoke");
  await loginViaUi(page, email, password);
  await expect(page).toHaveURL(/\/buyer\/dashboard/);
  const before = (await page.context().cookies()).find((c) => c.name === "msme_refresh");

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Log out");
  await page.getByRole("option", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Replaying the old refresh token is refused (blacklisted server-side).
  const replay = await request.post(`${DJANGO_API_URL}/auth/refresh/`, {
    data: { refresh: before!.value },
  });
  expect(replay.status()).toBe(401);
});

test("switching to Hindi translates the UI and is remembered across reloads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(page.getByRole("button", { name: "लॉग इन करें" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");

  await page.reload();
  await expect(page.getByRole("button", { name: "लॉग इन करें" })).toBeVisible();

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});
