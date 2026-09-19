import { expect, test } from "@playwright/test";

import { createAndGradeListing, getAgricultureVertical, loginViaUi, registerAndLogin } from "./helpers";

/**
 * Covers the other real path into an Order: a buyer posting a Requirement
 * rather than bidding on a specific listing. Before this was wired,
 * nothing in the codebase ever called FastAPI's matching engine at all —
 * `orders/views.py:RequirementViewSet.trigger_match` is what the frontend
 * calls immediately after posting a requirement (see
 * `components/buyer/post-requirement-dialog.tsx`'s `onCreate` handler in
 * `app/buyer/requirements/page.tsx`).
 */
test("posting a requirement for an already-active listing matches it automatically", async ({ page, request }) => {
  const seller = await registerAndLogin(request, "SELLER", "match-seller");
  const verifier = await registerAndLogin(request, "VERIFIER", "match-verifier");
  const buyer = await registerAndLogin(request, "BUYER", "match-buyer");
  const vertical = await getAgricultureVertical(request, buyer.access);

  const commodityName = `E2E Match Wheat ${Date.now()}`;
  const listing = await createAndGradeListing(request, seller.access, {
    verticalId: vertical.id,
    commodityName,
    quantity: 30,
    unit: "quintal",
    priceSuggested: 2100,
  });
  expect(listing.status).toBe("PENDING_VERIFICATION");

  await loginViaUi(page, verifier.email, verifier.password);
  await page.goto(`/verifier/queue/${listing.id}`);
  await page.getByRole("button", { name: "Confirm AI Grade" }).click();
  await expect(page).toHaveURL(/\/verifier\/queue$/);

  await loginViaUi(page, buyer.email, buyer.password);
  await page.goto("/buyer/requirements");
  await page.getByRole("button", { name: "Post requirement" }).click();

  await page.getByLabel("Vertical").click();
  await page.getByRole("option", { name: "Agriculture" }).click();
  await page.getByLabel("Commodity").fill(commodityName);
  await page.getByLabel("Quantity").fill("10");
  // The deterministic grading stub always scores 0.75 confidence per
  // ML-gradeable attribute regardless of the attribute weights/names (see
  // backend-fastapi/grading/pipeline.py:_stub_result), which lands in the
  // "Grade B" band (0.65–0.85) — not "Grade A" — so the min_grade filter
  // has to be set to something the stub can actually satisfy.
  await page.getByLabel("Min. grade").fill("Grade B");
  await page.getByLabel("Max price (₹)").fill("5000");
  await page.getByLabel("Region").fill("Rajasthan");
  await page.getByRole("button", { name: "Post requirement", exact: true }).click();

  await expect(page.getByText("Requirement posted.")).toBeVisible();
  // The post-requirement dialog fires the match trigger immediately after
  // creation. Wait for the success toast (unambiguous) rather than the
  // "Matched" status badge text, which also substring-matches the toast
  // itself while it's still on screen.
  await expect(page.getByText(/^Matched — order #\d+ created\.$/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Matched", { exact: true })).toBeVisible();

  await page.goto("/buyer/notifications");
  await expect(page.getByText("Requirement matched")).toBeVisible();
  await expect(page.getByText(new RegExp(`Your ${commodityName} requirement was fully matched`))).toBeVisible();
});
