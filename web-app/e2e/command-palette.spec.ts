import { expect, test } from "@playwright/test";

import { loginViaUi, registerAndLogin } from "./helpers";

test.describe("Command palette", () => {
  test("Ctrl/Cmd+K opens the palette and navigating to a page works", async ({ page, request }) => {
    const { email, password } = await registerAndLogin(request, "BUYER", "cmdk");
    await loginViaUi(page, email, password);

    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Type a page name or command…")).toBeVisible();

    await page.keyboard.type("Orders");
    await page.getByRole("option", { name: "Orders" }).click();

    await expect(page).toHaveURL(/\/buyer\/orders/);
    await expect(page.getByPlaceholder("Type a page name or command…")).not.toBeVisible();
  });

  test("pressing it again closes the palette", async ({ page, request }) => {
    const { email, password } = await registerAndLogin(request, "BUYER", "cmdk-toggle");
    await loginViaUi(page, email, password);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Type a page name or command…")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Type a page name or command…")).not.toBeVisible();
  });

  test("logging out from the palette clears the session and lands on /login", async ({ page, request }) => {
    const { email, password } = await registerAndLogin(request, "BUYER", "cmdk-logout");
    await loginViaUi(page, email, password);

    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("Log out");
    await page.getByRole("option", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto("/buyer/dashboard");
    await expect(page).toHaveURL(/\/login/); // session actually cleared, not just navigated away
  });
});
