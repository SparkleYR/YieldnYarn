import { expect, test } from "@playwright/test";

import { createAndGradeListing, DJANGO_API_URL, getAgricultureVertical, loginViaUi, registerAndLogin } from "./helpers";

/**
 * Counter-offer negotiation: a buyer bids, the seller counters (from the
 * Android seller app in real life — here via the same API it calls), and the
 * buyer accepts the counter on /buyer/offers. Accepting must create the order
 * at the *counter* price and draw down the listing.
 */
test("buyer accepts a seller's counter-offer and gets an order at the counter price", async ({ page, request }) => {
  const seller = await registerAndLogin(request, "SELLER", "counter-seller");
  const verifier = await registerAndLogin(request, "VERIFIER", "counter-verifier");
  const buyer = await registerAndLogin(request, "BUYER", "counter-buyer");
  const vertical = await getAgricultureVertical(request, buyer.access);

  const commodityName = `E2E Counter Wheat ${Date.now()}`;
  const listing = await createAndGradeListing(request, seller.access, {
    verticalId: vertical.id,
    commodityName,
    quantity: 50,
    unit: "quintal",
    priceSuggested: 2500,
  });
  if (listing.status === "PENDING_VERIFICATION") {
    const review = await request.post(`${DJANGO_API_URL}/verification/queue/${listing.id}/review/`, {
      headers: { Authorization: `Bearer ${verifier.access}` },
      data: { decision: "APPROVE" },
    });
    expect(review.ok()).toBeTruthy();
  }

  const bidRes = await request.post(`${DJANGO_API_URL}/orders/bids/`, {
    headers: { Authorization: `Bearer ${buyer.access}` },
    data: { listing: listing.id, offered_price: 2200, offered_quantity: 20, message: "Bulk order" },
  });
  expect(bidRes.ok()).toBeTruthy();
  const bid = (await bidRes.json()) as { id: number };

  const counterRes = await request.post(`${DJANGO_API_URL}/orders/bids/${bid.id}/counter/`, {
    headers: { Authorization: `Bearer ${seller.access}` },
    data: { offered_price: 2400, message: "Meet me at 2400" },
  });
  expect(counterRes.ok()).toBeTruthy();
  const counter = (await counterRes.json()) as { id: number };

  await loginViaUi(page, buyer.email, buyer.password);
  await page.goto("/buyer/offers");

  const card = page.getByTestId(`offer-${counter.id}`);
  await expect(card).toContainText(commodityName);
  await expect(card).toContainText("The seller sent a new price");
  await expect(card).toContainText("Meet me at 2400");
  await card.getByRole("button", { name: /^Accept/ }).click();

  await expect(page.getByText("Done! Your order has been made.")).toBeVisible();

  const ordersRes = await request.get(`${DJANGO_API_URL}/orders/orders/`, {
    headers: { Authorization: `Bearer ${buyer.access}` },
  });
  const orders = (await ordersRes.json()) as { results: { total_price: string; allocations: { listing: number }[] }[] };
  const order = orders.results.find((o) => o.allocations.some((a) => a.listing === listing.id));
  expect(Number(order?.total_price)).toBe(2400 * 20);

  const listingRes = await request.get(`${DJANGO_API_URL}/catalog/listings/${listing.id}/`, {
    headers: { Authorization: `Bearer ${seller.access}` },
  });
  expect(Number(((await listingRes.json()) as { quantity: string }).quantity)).toBe(30);

  // The original bid now shows as countered in the Closed tab.
  await page.getByRole("tab", { name: /Finished/ }).click();
  await expect(page.getByTestId(`offer-${bid.id}`)).toContainText("New price sent");
});

test("a buyer can counter back, which puts the ball in the seller's court", async ({ page, request }) => {
  const seller = await registerAndLogin(request, "SELLER", "counter2-seller");
  const verifier = await registerAndLogin(request, "VERIFIER", "counter2-verifier");
  const buyer = await registerAndLogin(request, "BUYER", "counter2-buyer");
  const vertical = await getAgricultureVertical(request, buyer.access);

  const listing = await createAndGradeListing(request, seller.access, {
    verticalId: vertical.id,
    commodityName: `E2E Counter Rice ${Date.now()}`,
    quantity: 10,
    unit: "quintal",
    priceSuggested: 3000,
  });
  if (listing.status === "PENDING_VERIFICATION") {
    await request.post(`${DJANGO_API_URL}/verification/queue/${listing.id}/review/`, {
      headers: { Authorization: `Bearer ${verifier.access}` },
      data: { decision: "APPROVE" },
    });
  }
  const bid = (await (
    await request.post(`${DJANGO_API_URL}/orders/bids/`, {
      headers: { Authorization: `Bearer ${buyer.access}` },
      data: { listing: listing.id, offered_price: 2600, offered_quantity: 5 },
    })
  ).json()) as { id: number };
  const counter = (await (
    await request.post(`${DJANGO_API_URL}/orders/bids/${bid.id}/counter/`, {
      headers: { Authorization: `Bearer ${seller.access}` },
      data: { offered_price: 2900 },
    })
  ).json()) as { id: number };

  await loginViaUi(page, buyer.email, buyer.password);
  await page.goto("/buyer/offers");
  const card = page.getByTestId(`offer-${counter.id}`);
  await card.getByRole("button", { name: "Send a new price" }).click();
  await card.getByLabel(/Price per quintal/).fill("2750");
  await card.getByRole("button", { name: "Send new price" }).click();
  await expect(page.getByText("Your new price has been sent to the seller.")).toBeVisible();

  await page.getByRole("tab", { name: /Waiting for seller/ }).click();
  await expect(page.getByText("₹2,750 / quintal")).toBeVisible();

  const sellerBids = (await (
    await request.get(`${DJANGO_API_URL}/orders/bids/?listing=${listing.id}&status=PENDING`, {
      headers: { Authorization: `Bearer ${seller.access}` },
    })
  ).json()) as { results: { offered_price: string; awaiting_response_from: string }[] };
  expect(sellerBids.results).toHaveLength(1);
  expect(sellerBids.results[0].awaiting_response_from).toBe("SELLER");
  expect(Number(sellerBids.results[0].offered_price)).toBe(2750);
});
