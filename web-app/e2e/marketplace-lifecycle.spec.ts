import { expect, test } from "@playwright/test";

import { DJANGO_API_URL, createAndGradeListing, getAgricultureVertical, loginViaUi, registerAndLogin } from "./helpers";

/**
 * The flagship E2E test: exercises the real seller → grade → verify → buy →
 * accept pipeline end to end, across three independently-registered
 * accounts.
 *
 * There is no seller-facing web UI yet (the seller app is a separate,
 * deliberately-deferred Kotlin/Android phase — see implementation_plan.md
 * §8), so listing creation, the grading trigger, and the seller's bid
 * decision all go through the real Django/FastAPI HTTP APIs directly rather
 * than a browser page — exactly what a seller app would call. Everything
 * downstream of that (verifier review, buyer browsing/bidding/order
 * history) drives the actual browser UI.
 */
test("a graded listing flows from seller creation through verifier approval, a buyer bid, and seller acceptance into a real order", async ({
  page,
  request,
}) => {
  const seller = await registerAndLogin(request, "SELLER", "lifecycle-seller");
  const verifier = await registerAndLogin(request, "VERIFIER", "lifecycle-verifier");
  const buyer = await registerAndLogin(request, "BUYER", "lifecycle-buyer");
  const vertical = await getAgricultureVertical(request, buyer.access);

  const commodityName = `E2E Wheat ${Date.now()}`;
  const listing = await createAndGradeListing(request, seller.access, {
    verticalId: vertical.id,
    commodityName,
    quantity: 15,
    unit: "quintal",
    priceSuggested: 2200,
  });

  // The real regression this guards: grading used to never advance
  // Listing.status at all (see implementation_plan.md §12) — a listing
  // would sit in PENDING_GRADING forever no matter how many times grading
  // ran, invisible to both the verifier queue and buyers.
  expect(listing.status).toBe("PENDING_VERIFICATION");

  // --- Verifier approves it ---
  await loginViaUi(page, verifier.email, verifier.password);
  await page.goto(`/verifier/queue/${listing.id}`);
  await expect(page.getByRole("heading", { name: commodityName })).toBeVisible();
  await page.getByRole("button", { name: "Confirm AI Grade" }).click();
  await expect(page).toHaveURL(/\/verifier\/queue$/);

  const listingAfterReview = await request.get(`${DJANGO_API_URL}/catalog/listings/${listing.id}/`, {
    headers: { Authorization: `Bearer ${buyer.access}` },
  });
  expect((await listingAfterReview.json()).status).toBe("ACTIVE");

  // --- Buyer finds it in the catalog and bids ---
  await loginViaUi(page, buyer.email, buyer.password);
  await page.goto("/buyer/catalog");
  await page.getByPlaceholder("Search commodity or variety…").fill(commodityName);
  await expect(page.getByText(commodityName)).toBeVisible();
  await page.getByText(commodityName).click();

  await expect(page).toHaveURL(new RegExp(`/buyer/catalog/${listing.id}$`));
  await page.getByRole("button", { name: "Buy Now" }).click();
  await expect(page.getByText("Offer sent to the seller at the listed price.")).toBeVisible();

  const bidsRes = await request.get(`${DJANGO_API_URL}/orders/bids/?listing=${listing.id}`, {
    headers: { Authorization: `Bearer ${buyer.access}` },
  });
  const bids = (await bidsRes.json()) as { results: { id: number; listing: number; offered_price: string; status: string }[] };
  expect(bids.results).toHaveLength(1);
  expect(bids.results[0]).toMatchObject({ listing: listing.id, offered_price: "2200.00", status: "PENDING" });

  // --- Seller accepts the bid (API — no seller UI exists yet) ---
  const bidId = bids.results[0].id;
  const acceptRes = await request.patch(`${DJANGO_API_URL}/orders/bids/${bidId}/`, {
    headers: { Authorization: `Bearer ${seller.access}` },
    data: { status: "ACCEPTED" },
  });
  expect(acceptRes.ok()).toBeTruthy();

  // The real regression this guards: accepting a bid used to be a pure
  // status flip — no Order/OrderAllocation ever materialized, so this order
  // would never have appeared here (see implementation_plan.md §12). This
  // buyer was freshly registered for this test, so it's their only order.
  await page.goto("/buyer/orders");
  await page.getByRole("button", { name: /Confirmed/ }).click();
  await expect(page.getByText(commodityName)).toBeVisible();
  await expect(page.getByText("15.00 quintal")).toBeVisible();

  // The Buy Now bid offered the listing's full remaining quantity (15), so
  // acceptance should have exhausted and sold it out.
  const listingAfterAccept = await request.get(`${DJANGO_API_URL}/catalog/listings/${listing.id}/`, {
    headers: { Authorization: `Bearer ${seller.access}` },
  });
  const soldListing = await listingAfterAccept.json();
  expect(soldListing.status).toBe("SOLD");
  expect(Number(soldListing.quantity)).toBe(0);
});
