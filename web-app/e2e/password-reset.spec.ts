import { expect, test } from "@playwright/test";

import { registerAndLogin, uniqueEmail } from "./helpers";

/**
 * `/forgot-password` and `/reset-password` — see accounts/tests.py:
 * PasswordResetTest on the Django side for the full token-generation /
 * enumeration-protection / token-reuse coverage (that's server logic, not
 * worth re-deriving here). These specs exercise the real frontend against
 * the real backend: the request flow end-to-end, and the confirm flow's
 * real error handling for a bad link — without needing to scrape a
 * dev-server log file for a real token, which isn't a stable enough
 * convention across environments for a committed spec to depend on.
 */
test.describe("Password reset", () => {
  test("requesting a reset for a real registered email shows the real success state", async ({ page, request }) => {
    const { email } = await registerAndLogin(request, "BUYER", "pwreset");

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
  });

  test("requesting a reset for an unregistered email shows the same success state (no enumeration)", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(uniqueEmail("nobody"));
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
  });

  test("visiting /reset-password without a link shows an invalid-link state, not a broken form", async ({ page }) => {
    await page.goto("/reset-password");

    await expect(page.getByText("Invalid reset link")).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).not.toBeVisible();
  });

  test("submitting an expired/forged token against the real backend shows the real error", async ({ page }) => {
    await page.goto("/reset-password?uid=fake&token=not-a-real-token");

    await page.getByLabel("New password", { exact: true }).fill("BrandNewPassword456");
    await page.getByLabel("Confirm new password").fill("BrandNewPassword456");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password/); // did not navigate away
  });

  test("mismatched passwords are caught client-side before any request is sent", async ({ page }) => {
    await page.goto("/reset-password?uid=fake&token=whatever");

    await page.getByLabel("New password", { exact: true }).fill("BrandNewPassword456");
    await page.getByLabel("Confirm new password").fill("SomethingElse789");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page.getByText("Passwords don't match")).toBeVisible();
  });
});
