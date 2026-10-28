# YieldnYarn — exact website walkthrough for faculty

Prepared for the local review on 9 October 2026. Follow this guide for the complete website implementation, including forms and administrator configuration. Use [faculty-review.md](faculty-review.md) for the shorter phone/photo narrative and [image-results.md](image-results.md) for dataset attribution and measured predictions.

Button names below use **English**. Every website URL starts with **http://localhost:3000**. Links are clickable. Newly created listing/order IDs will differ; record them when instructed.

## Before starting

1. Connect and unlock the phone; keep USB debugging authorized and the cable connected.
2. In PowerShell in `C:\Users\yasha\Documents\yieldnyarn`, run:

   ```powershell
   .\start-demo.ps1 -SkipSeed
   ```

   This starts/reuses the servers and reconnects phone USB forwarding. Use `.\start-demo.ps1` if missing seed examples need adding. These commands preserve completed demonstrations; they do not reset stock.
3. Use one browser profile for the buyer and another/private profile for verifier/admin. Tabs in the same profile share a login; multiple private windows can share one private session too.
4. Open the installed YieldnYarn app on the phone. Its real-photo folder is **Pictures/YieldnYarnReal**. Gallery usually shows it under Collections → From this device. The older YieldnYarnDemo album contains generated samples.
5. Keep the laptop awake. Website: port 3000; Django: 8000; FastAPI: 8001. The installed phone reaches the laptop through USB forwarding.

Review readiness checked on 9 October: **34/34 checks passed**, all three services respond, and phone USB forwarding is connected for ports 8000 and 8001. The original three wheat lots still contain **40 + 80 + 65 = 185 quintals**, so the 100-quintal bulk example below is ready. All 15 original dataset photographs are present on the phone, with YieldnYarn open. Current market estimates may differ from rehearsed figures; use the values shown live. The isolated Faculty Demo Wheat calculation uses the explicit ₹2,500 record described below.

Plain-text copies of this guide and the shorter faculty narrative have been transferred to **Download → YieldnYarnReview** on the attached phone. To update them after future edits, run:

```powershell
& C:\platform-tools\adb.exe push .\.demo\real-images\website-walkthrough.txt /sdcard/Download/YieldnYarnReview/website-walkthrough.txt
& C:\platform-tools\adb.exe push .\.demo\real-images\faculty-walkthrough.txt /sdcard/Download/YieldnYarnReview/faculty-walkthrough.txt
```

Then find the guide in the phone's **Download → YieldnYarnReview** folder. The website walkthrough is already usable from this Markdown file on the laptop.

**All prepared accounts use `Demo@12345`.**

| Account | Role / use | Login destination |
| --- | --- | --- |
| `buyer@demo.local` | Anand Traders; main buyer window | `/buyer/dashboard` |
| `checker@demo.local` | Priya Sharma; verifier window | `/verifier/dashboard` |
| `admin@demo.local` | Administrator; staff window later | `/admin/dashboard` |
| `farmer@demo.local` | Ramesh Patil; agriculture seller on phone | Phone Home |
| `weaver@demo.local` | Sunita Handloom; textile seller on phone | Phone Home |
| `mohan@demo.local` | Additional wheat seller | Phone Home |
| `kavita@demo.local` | Additional wheat seller | Phone Home |
| `buyer2@demo.local` | Additional buyer | `/buyer/dashboard` |

For **20–25 minutes**, show sections 2–10, one textile case from 11, then admin price entry, price-rule calculation and complaint handling in 13, 15 and 17. For a complete **40–50 minute** demonstration, follow all sections, including account registration, schema editing and password reset. Run the bulk purchase before other large wheat transactions.

## Navigation index

- [Public pages and registration](#1-public-pages-and-registration)
- [Buyer home and market](#2-buyer-home-and-market)
- [Bulk requirements](#3-bulk-requirements-exact-form-and-result)
- [Price estimator](#4-price-estimator-and-history)
- [Phone upload](#5-phone-handoff-create-a-real-photo-listing)
- [Verifier dashboard and full review](#6-verifier-dashboard-queue-and-full-review)
- [Negotiation](#7-negotiation-buyer-offer-seller-counter-buyer-acceptance)
- [Direct buy](#8-buy-at-this-price-demonstration)
- [Orders and reporting problems](#9-orders-and-reporting-a-problem)
- [Updates, language and navigation](#10-updates-language-and-navigation)
- [Textile review and rejection](#11-textile-case-and-send-back-to-seller)
- [Admin home](#12-administrator-home)
- [Admin market prices](#13-administrator-market-prices-add-a-record)
- [Admin quality schema](#14-administrator-categories-and-editable-quality-checks)
- [Admin price rules with exact arithmetic](#15-administrator-price-rules-live-before-and-after)
- [Admin quick verification](#16-administrator-quality-check-dialog)
- [Admin complaints](#17-administrator-complaints-resolve-and-escalate)
- [Admin people](#18-administrator-people-search-filter-and-activation)
- [Password reset](#19-local-password-reset)
- [Phone profile and storage](#20-phone-profile-and-local-storage)
- [All 27 website pages](#complete-page-coverage-checklist)
- [Restoration and fallbacks](#finish-and-restore-settings)

Opening statement: **“YieldnYarn connects agriculture and textile sellers with buyers. Sellers upload inventory and photographs from Android. The system suggests quality, sends uncertain results to human review, and supports prices, bulk matching, negotiation, orders and complaints.”**

## 1. Public pages and registration

Open [Home](http://localhost:3000/) before logging in.

| Exact header label | Go to | Show / explain |
| --- | --- | --- |
| How it works | [Services](http://localhost:3000/services) | The visitor-facing explanation of the seller-to-buyer process. |
| What you can sell | [Verticals](http://localhost:3000/verticals) | Agriculture and Textiles, products and different units. |
| Guides | [Guides](http://localhost:3000/blog) | Built-in guidance about photographs, grades, prices and problems. |
| Pricing | [Public pricing](http://localhost:3000/pricing) | Account/service pricing information, including free account access. |
| Log in | [Login](http://localhost:3000/login) | Existing account form. |
| Create free account | [Register](http://localhost:3000/register) | New account form. |

On Home, expand one FAQ. Click **I want to sell** to open registration with Sell selected, or **I want to buy** with Buy selected. The homepage listing example is a promotional illustration; database inventory is in the buyer Market. Guides are built-in content, and Public Pricing is separate from the admin Market prices page.

### Optional registration demonstration

Open [buyer registration](http://localhost:3000/register?role=buyer) and fill:

| Field/control | Exact entry |
| --- | --- |
| Full name | `Faculty Review Buyer` |
| Email | `faculty.visit01@demo.local` |
| Password | `Demo@12345` |
| Role card | **Buy** |
| Submit | **Create account** |

If that address already exists, use `faculty.visit02@demo.local` and remember it. Registration signs the new user in and opens the buyer dashboard. Empty orders/requests are expected for a new account.

Then click avatar/account menu → **Log out**. At [Login](http://localhost:3000/login), enter **Email** `buyer@demo.local`, **Password** `Demo@12345`, then **Log in**. Use this prepared buyer for the following demonstrations.

The web registration offers Sell and Buy. The implemented seller workspace is Android; seller website login currently also routes to `/buyer/dashboard`. Use the phone to demonstrate seller operations.

## 2. Buyer home and market

**Account: buyer@demo.local. These browsing actions do not change stock.**

1. Open [Buyer Home](http://localhost:3000/buyer/dashboard). Show the greeting, open-buy-request count, orders in progress, total spent and items for sale. These values come from the database and change during the demo.
2. Point out **Browse market**, **Tell us what you need**, **Check a price**, recent orders and **View all**.
3. Click sidebar **Market**, or open [Catalog](http://localhost:3000/buyer/catalog).
4. In **Search: wheat, rice, cotton…**, enter `Wheat`. Search matches crop/product or variety text. Clear it before showing other products.
5. Choose **Agriculture** in the category filter. Try **Lowest price first**, **Highest price first**, and **Best quality first** in the sort dropdown. Restore **All categories** and clear search afterward.
6. Open [Wheat listing #1](http://localhost:3000/buyer/catalog/1). Show variety, place, seller, available quantity, photos, grade and **Quality report**. Click a photo for a full-size view.
7. Show **Price you pay** and **Available**. Asking-price/quality-adjustment rows appear only when the stored final price differs from the seller's suggested price.
8. Open [Cotton fabric listing #6](http://localhost:3000/buyer/catalog/6). Point out **metre** instead of **quintal**. Return to Market.

The buyer API supplies active listings. Newly uploaded stock awaiting verification becomes available to buyers after approval. The website catalog does not create seller listings or upload seller photos; the phone does that.

## 3. Bulk requirements: exact form and result

**Account: buyer. Saving can immediately create an order and reduce stock. Demonstrate before large wheat offers.**

1. Click sidebar **What I need**, or open [Requirements](http://localhost:3000/buyer/requirements).
2. Click **Add what you need**. Dialog title: **What do you want to buy?**
3. Fill:

| Exact field | Entry |
| --- | --- |
| Category | **Agriculture** |
| Crop or product | `Wheat` |
| Quantity | `100` |
| Lowest quality you accept | **Grade B — good** |
| Highest price per unit (₹) | `3000` |
| Place | `Madhya Pradesh` |
| Submit | **Save and find sellers** |

4. Matching runs automatically. Look for **Seller found — order #… created.** Record that order number; refresh the request table if needed.
5. Open [My orders](http://localhost:3000/buyer/orders). Click the matching **Order #…** row to expand it. Show **What is coming**: seller, allocated quantity, unit price and total. Explain how multiple allocations combine into the order.
6. Refresh Market/phone My items to show reduced inventory.

Original eligible wheat stock: **40 + 80 + 65 = 185 quintals**, largest lot 80. A fresh 100-quintal request requires multiple sellers. If rehearsals consumed that stock, inspect availability and use a smaller quantity. The Place field stores descriptive text; it does not supply GPS coordinates for distance matching.

### Optional no-match branch

Create Agriculture / crop **`Faculty unavailable crop`** / quantity **`1`** / Grade B / maximum **`3000`** / Place **`Madhya Pradesh`**. Click **Save and find sellers**. Expected: request remains Open, no matching order. Click **Find sellers** in that row to show retrying. This row button appears only for Open requests.

For partial matching, request more Wheat than the remaining eligible stock and show the shortfall plus allocations. Do this last: it can consume all remaining matching inventory. Saving a requirement is an actual purchase/matching operation, not a read-only quotation.

## 4. Price estimator and history

**Account: buyer. Read-only; no order is created.**

Open sidebar **Check a price**, or [Estimator](http://localhost:3000/buyer/estimate).

| Exact field | Agriculture example | Textile example |
| --- | --- | --- |
| Category | Agriculture | Textiles |
| Crop or product | `Wheat` | `Cotton fabric` |
| Quantity | `100` | `100` |
| Quality (optional) | Grade A — best | Grade A — best |
| Submit | **Show me the price** | **Show me the price** |

1. Show **Your order would cost about**, **Price per unit (for this quality and amount)**, quantity and the 30-day price-history chart.
2. Wheat: compare quantities **10**, **100**, **200**, recalculating each time. Agriculture discount thresholds are 50 and 200 quintals.
3. At quantity 100, compare Grade A, B and C; recalculate each time.
4. Try crop `Faculty unknown crop` to show the no-price-data message, then restore Wheat.

The form has no region field. It uses the latest matching category/crop market-price record across regions. The estimator's **Seller's asking price** label displays that market base price. Estimates, stored listing prices and negotiated order prices are separate values. The chart shows historical base prices, not order totals.

Say: **“The calculation runs live against our local data. The price history and mandi examples are seeded review records; I am not claiming a live feed update.”** Section 15 demonstrates exact before/after totals when the admin changes a rule.

## 5. Phone handoff: create a real-photo listing

**Phone account: farmer@demo.local. Creates 2 quintals for the next transaction.**

Show **Home**, **My items**, **Offers**, **Updates**, **Profile**. Home → **Sell something**:

| Wizard step | Fill / click |
| --- | --- |
| Type | **Agriculture** → **Next** |
| Product | Wheat; Variety **`Faculty wheat live`**; State **Madhya Pradesh** → Next |
| Quantity/price | Quantity **`2`** quintals; Your price **`2450`** per quintal; show the state mandi suggestion but retain 2450; location optional → Next |
| Photos | **Gallery** → YieldnYarnReal → **`wheat-source-A-1.jpg`**, **`wheat-source-A-2.jpg`** → Next |
| Review | Confirm all details and both photos → **Put up for sale** |

Open My items, pull down to refresh, and open **Faculty wheat live**. Record its server listing ID as **L**. Show sync/checking/quality states and photographs. This pair previously produced **Grade C, 57.92% confidence**; let the current result finish.

If the new upload is delayed, explicitly use prepared **Real dataset - Wheat source A**, listing **77**, and set **L = 77**. Distinguish a prepared fallback from a new completed upload. These dataset examples are real photographs, not proof that both photos depict one physical seller lot.

## 6. Verifier dashboard, queue and full review

**Separate staff window: checker@demo.local / Demo@12345.**

1. Open [Verifier Home](http://localhost:3000/verifier/dashboard). Show **Waiting to be checked**, **Urgent**, and **Next up**.
2. Click **See all**, or sidebar **Photos to check**, to open [Queue](http://localhost:3000/verifier/queue). Show seller, reason, photo-check grade, **How sure**, priority and **Check**.
3. Open `http://localhost:3000/verifier/queue/L`, replacing L with the actual number. Fallback: [Wheat #77](http://localhost:3000/verifier/queue/77). Multiple rows can have the same crop; verify the correct listing number.
4. Click each photo thumbnail and **Open full size**. Show **Photo check says**, confidence and **Quality scores**.
5. Explain that the independent dataset source calls the source-A sample Grade A, while this prototype predicts Grade C. This is an observed misclassification. Source grade definitions and capture conditions differ from the app's criteria; it does not establish independent model accuracy.
6. Demonstrate an explicitly illustrative human correction:

| Visible row / field | Entry |
| --- | --- |
| Clean (no dust, stones or husk) → **Your %** | `95` |
| Whole grains (not broken or damaged) → **Your %** | `95` |
| Note for the seller | `Faculty demonstration: illustrative manual assessment after photo inspection; AI output retained for comparison.` |
| Action | **Approve with my scores** |

7. Expected: the item leaves the queue and becomes Active, with a latest human Grade A under the current equal weights. Refresh buyer Market and phone inventory. Buyer detail is now `http://localhost:3000/buyer/catalog/L`.

Higher percentages mean **better quality**. Clean 0% does not mean zero foreign matter. Correcting a score or sending back requires a note. If agreeing with the existing scores, leave correction boxes empty and click **Approve**.

After approval, `/verifier/queue/L` is no longer a pending item. Use buyer detail or phone inventory to inspect the result. Human correction changes the latest assessment; it does not retrain the model or certify laboratory quality.

## 7. Negotiation: buyer offer, seller counter, buyer acceptance

Use the approved **2-quintal** listing L. This trades **1 quintal**, leaving 1 for section 8.

### Buyer offer

1. Buyer window → `http://localhost:3000/buyer/catalog/L` → **Offer a different price**. Dialog: **Make an offer**.
2. Replace the default values:

| Field | Entry |
| --- | --- |
| Your price (₹ per quintal) | `2300` |
| How much (quintal) | `1` |
| Submit | **Send offer** |

The dialog defaults to all available quantity: explicitly enter 1. It has price and quantity, with no note field.

3. Open [Offers](http://localhost:3000/buyer/offers) → **Waiting for seller**. Show the pending offer.

### Seller counter on phone

4. Farmer phone → Offers → refresh → choose Anand Traders' new 1-quintal / ₹2,300 offer → **New price**.

| Phone field | Entry |
| --- | --- |
| Price per quintal (₹) | `2400` |
| How much (quintal) | `1` |
| Message (if you want) | `Faculty demonstration: counter for one quintal.` |
| Action | **Send** |

### Buyer acceptance

5. Buyer laptop → refresh Offers → **Your turn to reply**. Show **The seller sent a new price**.
6. Click **Accept · ₹2,400**. Expected: **Done! Your order has been made.** The offer moves to **Finished**.
7. My orders → expand the new order → **1 quintal × ₹2,400 = ₹2,400**. Record order ID as **N**.
8. Refresh listing and phone inventory: **1 quintal remains**.

### Optional alternative response branches

- **Buyer counter:** instead of accepting the seller's counter, click **Send a new price**. Fill **Price per quintal (₹)** `2350`, **Quantity (quintal)** `1`, **Note for the seller (optional)** `Can we agree at 2350?`, then **Send new price**. It moves to Waiting for seller. Accept it on the phone; the order total is then ₹2,350 instead of ₹2,400.
- **Buyer rejection:** on a separate counter awaiting the buyer, click **Say no**. It moves to Finished without an accepted order. Keep the main transaction separate.
- **Seller acceptance:** on a separate fresh buyer offer, the phone **Accept** creates the confirmed order directly. New price is its negotiation alternative.

Choose one final response per offer. Prepared fallback: original Soybean counter at **₹4,520 × 25 quintals = ₹1,13,000**. Accepting it consumes the full soybean lot, so the small new Wheat example is preferable for the core flow.

## 8. Buy at this price demonstration

Use listing L's remaining **1 quintal** after section 7.

1. Reload listing detail first. Confirm Available = 1 and read **Price you pay**. The fresh lot's asking price was ₹2,450/unit.
2. Click **Buy at this price** once.
3. Expected: **Your order request has been sent to the seller.** Offers → **Waiting for seller** shows the request at the displayed unit price.
4. Farmer phone → refresh Offers → **Accept** that request.
5. Buyer My orders → refresh → expand the new order. At ₹2,450/unit, this 1-quintal order totals ₹2,450.
6. Refresh phone inventory: zero remaining stock, Sold. The listing leaves the active buyer market.

**Actual behavior:** Buy at this price sends a pending bid for **the entire remaining lot**, with no quantity dialog. Seller acceptance creates the order. It is not an immediate checkout confirmation or online payment. Reloading before clicking avoids using the old 2-quintal value.

## 9. Orders and reporting a problem

**Account: buyer.** Open [My orders](http://localhost:3000/buyer/orders).

1. Show prepared orders with different statuses. Click **Order #N** from section 7 to expand it; there is no separate website order-detail route.
2. Show **What is coming**, seller, quantity, unit price and total. For a bulk order, show **Made from your request #…** and multiple allocations.
3. On order N click **Report a problem**. Dialog: **Problem with order #N**.
4. Choose **Quality is lower than shown**. Other options: **Less quantity than ordered**, **Goods are damaged or spoiled**, **Something else**.
5. In **Tell us more**, enter:

   `Faculty demonstration complaint: received sample appears different from the approved photographs. Please review with the seller.`

6. Click **Send report**. Expected: an Open complaint against that seller. The seller gets an in-app update; the admin handles it in section 17.

Creating a complaint does **not** automatically change this order to Disputed; complaint status is tracked separately. A prepared order already has Disputed status. Use the single-seller order N for this report: the website automatically selects the first allocated seller and has no seller selector for multi-seller complaints.

The order page displays allocations and supports reports. It has no payment gateway, delivery-status editor or cancel-order button.

## 10. Updates, language and navigation

1. Sidebar **Updates**, header bell, or [Buyer Updates](http://localhost:3000/buyer/notifications). Refresh to retrieve events created in other windows.
2. Show offer/order/dispute messages, timestamps and **New** badges.
3. Click an unread update: its New badge disappears. This marks it read; it does not navigate to an order/listing.
4. Click **Mark all as read**. It appears only while unread notifications remain.
5. Press **Ctrl+K**, type **Market**, select the result and press Enter. Repeat with **Check a price**. The menu also contains public Home and Log out.
6. Collapse/expand the sidebar with its toggle. Switch the buyer language selector to Hindi, show translated navigation/form labels, then restore English.
7. Avatar menu → **Profile** returns to the role dashboard. Editable seller profile details are in Android. **Log out** ends the web session and opens Login.

The website's public/auth/buyer areas support Hindi and English; admin/verifier page content stays English. This local setup uses in-app inbox notifications; Firebase push is not configured.

## 11. Textile case and send back to seller

1. Phone Profile → Log out → **weaver@demo.local / Demo@12345**.
2. My items → **Real dataset - Cotton hole**, listing **83**, and **Real dataset - Cotton oil**, listing **82**. Show original photographs, metre quantities and computed results: hole Grade C / 57.03%; oil Grade C / 50.83% in the rehearsal.
3. Checker window → [Cotton hole #83](http://localhost:3000/verifier/queue/83). Show both photos. The quality row is **No holes, stains or loose threads**.
4. Leave corrections blank. Fill **Note for the seller**:

   `Visible holes in the supplied dataset photos; please submit a suitable replacement sample.`

5. Click **Send back to seller**. It leaves the queue and becomes **Draft**. Refresh phone My items and Updates to show the returned item and message.
6. Optional new textile upload: Sell something → Textiles → Cotton fabric; Variety `Faculty cotton live`; State Gujarat; Quantity `10`; Your price `145` per metre; Gallery `cotton-hole-1.jpg` and `cotton-hole-2.jpg`; review → Put up for sale.

If #83 was already reviewed, use a still-pending textile case: #80 slub, #81 knot or #82 oil. The source filenames label defect types; the app reports estimated quality scores rather than those four defect class names. All supplied textile examples contain defects.

## 12. Administrator home

Staff window → checker Log out → **admin@demo.local / Demo@12345** → [Admin Home](http://localhost:3000/admin/dashboard).

1. Show **Items listed**, **Orders**, **People**, **Money in orders**, waiting-quality and open-complaint panels.
2. Listing counts include all statuses, unlike active buyer-market inventory. Money in orders counts confirmed/delivered orders rather than every order status.
3. Starting snapshot: **22 listings, 5 orders, 8 users, ₹1,13,000 counted order value**. Your live actions increase/change these numbers; explain the current values.
4. Show sidebar **Categories**, **Quality checks**, **Complaints**, **People**, **Market prices**, and the dashboard shortcuts.

## 13. Administrator market prices: add a record

Open **Market prices**, or [Admin Pricing](http://localhost:3000/admin/pricing).

1. Show **All prices**, **Added by hand**, **From the mandi feed**, and the table's Source column. Initial data: **403 total, 372 manual, 31 Agmarknet-tagged offline fixture records**.
2. Click **All**, **Agriculture**, **Textiles** tabs. They filter the loaded table page. The counters describe database totals; the table shows the latest API page, not all historical records.
3. Click **Add a price** and fill:

| Exact field | Entry |
| --- | --- |
| Category | **Agriculture** |
| Crop or product | `Faculty Demo Wheat` |
| Place (state) | `Madhya Pradesh` |
| Price (₹) | `2500` |
| Unit | `quintal` |
| Submit | **Add price point** |

4. Expected toast: **Price point added.** New row source: **Added by hand**; date: now. All prices and Added by hand rise by one.
5. Refresh to prove persistence. There is no date input; timestamp is generated automatically.
6. Keep exact crop spelling **Faculty Demo Wheat** for section 15. This isolates the numeric demo from the main Wheat price record.

Optional textile record: Textiles / `Faculty Demo Cotton` / Gujarat / `150` / `metre` → Add price point. Buyer estimate at quantity 100, Grade B: **₹150/unit, ₹15,000 total** under baseline rules.

This page adds records; it has no price edit/delete button or source-filter dropdown. Source labels identify record provenance; the seeded examples do not prove a fresh live feed fetch during this review.

## 14. Administrator categories and editable quality checks

Open **Categories**, or [Admin Categories](http://localhost:3000/admin/verticals).

1. Show Agriculture and Textiles cards, units, quality-check counts and price levels.
2. Click Agriculture → [Editor #1](http://localhost:3000/admin/verticals/1). Textiles → [Editor #2](http://localhost:3000/admin/verticals/2).
3. In **Quality checks**, show each implemented control:

| Column/control | What it changes |
| --- | --- |
| Check | Stored attribute name. |
| Kind | **Number**, **Choice**, **Yes / no**. |
| From photos | Schema flag for photo grading; does not train a new model. |
| Importance | Percentage weight; current weighted checks sum to 100%. |
| Allowed range | Editable schema range/description. |
| Up/down icons | Row order. |
| Trash icon | Remove a check. |
| Add a check | Append a row. |
| Save changes | Persist grading schema and price rules. |

Baseline data:

| Category | Check | Kind | From photos | Importance | Range endpoints |
| --- | --- | --- | --- | --- | --- |
| Agriculture | `foreign_matter` | Number | On | 50% | 0, 100 |
| Agriculture | `damaged_kernels` | Number | On | 50% | 0, 100 |
| Agriculture | `moisture` | Number | Off | 0% | 0, 30 |
| Textiles | `defect_rate` | Number | On | 100% | 0, 100 |
| Textiles | `gsm` | Number | Off | 0% | 30, 600 |

### Exact reversible schema demonstration

4. Agriculture → **Add a check**, then fill the appended row:

| Column | Entry |
| --- | --- |
| Check | `faculty_visual_note` |
| Kind | **Choice** |
| From photos | **Off** |
| Importance | `0` |
| Allowed range | `clear / needs review` |

5. Show Importance adds up to 100%. Click **Save changes** → **Vertical configuration saved.** Refresh; the new row persists.
6. Use its up/down arrows to show reordering. Changes need Save changes to persist.
7. Click **Preview**. Show **Sample Agriculture commodity**, configured attributes and From photos badges. Click **Editing** to return.
8. Trash only `faculty_visual_note`, then **Save changes** and refresh. Confirm the original three checks remain.

Preview uses a fixed ₹2,500 example base and the first configured grade; Grade A +10% produces ₹2,750. It is a visual example, not an AI run or live seller listing. This website edits existing categories; the category list has no Add category button.

## 15. Administrator price rules: live before and after

Use **Faculty Demo Wheat**, base ₹2,500, from section 13. Keep buyer and admin windows visible side by side. This proves stored admin rules affect the live estimator.

Admin → [Agriculture editor](http://localhost:3000/admin/verticals/1) → **Price rules**.

| Price change by quality row | Baseline percentage |
| --- | --- |
| `Grade A` | `10` |
| `Grade B` | `0` |
| `Grade C` | `-12` |

Keep the full names, including **Grade**; the selected buyer grade must match the stored rule name.

| Category | Bulk discounts: At least | Baseline % off |
| --- | --- | --- |
| Agriculture | 0 units | 0 |
| Agriculture | 50 units | 2 |
| Agriculture | 200 units | 5 |
| Textiles | 0 units | 0 |
| Textiles | 500 units | 3 |
| Textiles | 2000 units | 6 |

**Formula:** unit price = market base × quality multiplier × quantity multiplier. The highest reached quantity tier supplies the discount; discounts do not add together. Total = rounded unit price × quantity.

### Before, change, observe, restore

1. Buyer → [Check a price](http://localhost:3000/buyer/estimate). Fill Category **Agriculture**, Crop **`Faculty Demo Wheat`**, Quantity **`100`**, Quality **Grade B — good** → **Show me the price**.
2. Expected baseline: **₹2,450/unit; ₹2,45,000 total** (`2500 × 1.00 × 0.98`).
3. Admin → Price change by quality → **Grade B** row → replace percentage **0** with **5**. Leave all other fields unchanged.
4. **Save changes** → wait for **Vertical configuration saved.** Refresh to confirm the stored 5%.
5. Buyer → same form inputs → **Show me the price** again. Expected: **₹2,572.50/unit; ₹2,57,250 total** (`2500 × 1.05 × 0.98`).
6. Admin → restore Grade B to **0** → **Save changes**. Recalculate as buyer; baseline **₹2,450/unit; ₹2,45,000 total** returns.

### Optional bulk-tier edit

7. Admin → Bulk discounts → **Add tier**. Fill **At least** `500` units, **% off** `7` → **Save changes**.
8. Buyer → Faculty Demo Wheat, Quantity **500**, Grade B → calculate. Expected: **₹2,325/unit; ₹11,62,500 total** (`2500 × 1 × 0.93`).
9. Admin → trash only the new **500 / 7** tier → **Save changes**.
10. Buyer → calculate again at 500. Expected baseline: **₹2,375/unit; ₹11,87,500 total**, using the original 200-unit/5% discount.

### Add grade control

**Add grade** appends a name/percentage row. To demonstrate the control, add temporary `FacultyGrade` / `0`, show it, then trash it before saving. A new price-rule name does not add a buyer grade option or teach the classifier a new grade; current selectors/classifier use Grade A/B/C.

These rule changes affect subsequent calculations. They do not retroactively rewrite existing orders, negotiated prices or all listings' stored prices. Save changes persists both schema and rules, regardless of which editor tab you used.

## 16. Administrator quality-check dialog

Open **Quality checks**, or [Admin Verification](http://localhost:3000/admin/verification).

1. Show **Waiting**, **Urgent**, **No grade yet**, and the pending table.
2. Click **Check** on a still-pending listing. Prepared example: Wheat / Ramesh Patil, listing **11**. Check the dialog listing number because multiple wheat rows exist.
3. Show the dialog's AI grade, confidence and quality summaries. This compact administrator dialog is separate from the full verifier page.
4. Choose **Approve**. Fill **Note for the seller** with `Faculty demonstration: administrator reviewed the existing result.` Click **Save**.
5. Expected: it leaves the pending table and becomes Active. Refresh buyer Market or seller phone inventory.

To reject a different pending item: choose **Send back to seller**, enter a required reason, then **Save**. Status becomes Draft. For photographs and numerical corrections, click **See photos & correct scores** to open `/verifier/queue/<id>`, which admins can also use. Approval without corrections retains the existing grade.

Use a different listing from L, already reviewed/traded in the main flow. A reviewed listing is absent from the queue.

## 17. Administrator complaints: resolve and escalate

Open **Complaints**, or [Admin Complaints](http://localhost:3000/admin/disputes).

1. Show **Open**, **Solved**, **All complaints**. Open includes Open and Under review records. Table: order, complainant, description, status and action.
2. Find the new report for **order N** from section 9 → **Handle**.
3. In **What was done**, enter:

   `Faculty demonstration: reviewed both parties' sample descriptions; recorded an agreed replacement for the quality mismatch.`

4. Click **Mark as solved**. Expected **Dispute resolved.**, complaint becomes Resolved, counters update. This records your resolution statement; it does not ship goods or process a refund.
5. Refresh buyer Updates and phone seller Updates: both parties receive the status change.
6. For escalation, select a different Open/Under review complaint. Prepared fallback: complaint on **order #4** → **Handle**.
7. Fill **What was done**:

   `Faculty demonstration: parties disagree on the quality assessment; referred for senior review.`

8. Click **Send to senior staff**. Expected **Dispute escalated.**, status Escalated. This records escalation, not an email or a separate senior-staff portal.

Handle is disabled after Resolved/Escalated. There is no reopen control or separate Under review setter on this page. Resolve and escalate two distinct complaints.

## 18. Administrator people: search, filter and activation

Open **People**, or [Users](http://localhost:3000/admin/users).

1. **Search by name or email…** → `farmer@demo.local`. Show account, role and joined date; clear search.
2. Role filter → **Seller**, **Buyer**, **Verifier**, **Admin**, then restore **All roles**.
3. For activation, use the fresh **faculty.visit01@demo.local** account from section 1, rather than a prepared account needed for the presentation.
4. Search its email; switch **Can log in** off. This saves immediately, with no extra Save button.
5. In a spare logged-out browser profile, try that account's login. It cannot sign in while inactive.
6. Admin window → switch Can log in on → retry login in the spare profile. It works again. Leave it active.

This table supports search, role filtering and activation. It has no role-editing form, administrator-create form or user-delete button. If registration was skipped, show the controls without toggling an account.

## 19. Local password reset

Use only the fresh **faculty.visit01@demo.local** account (or visit02 you chose). This changes that account's password; leave prepared account passwords alone.

1. Logged-out window → [Login](http://localhost:3000/login) → **Forgot password?**, or [Forgot password](http://localhost:3000/forgot-password).
2. Enter the fresh email → **Send me the link**. Show **Check your email**.
3. Local email is configured to Django's console backend. Read the generated email on the laptop:

   ```powershell
   Get-Content .\.demo\logs\django.out.log -Tail 120
   ```

4. Copy the newest `/reset-password?uid=...&token=...` URL from that email into the browser, keeping both parameters intact.
5. Fill **New password** and **Confirm new password** with **`FacultyReview@12345`** → **Save new password**.
6. Log in as that fresh account with its new password. Prepared accounts still use Demo@12345.

Opening [Reset password](http://localhost:3000/reset-password) without the parameters shows the missing/invalid-link state. The actual form requires the generated link. Password reset is implemented; this local setup emits email to a log instead of delivering to an inbox.

## 20. Phone profile and local storage

1. Phone **Profile**: show seller details and editable profile controls. If editing name/phone, record and restore originals after saving.
2. **App language** → Hindi → show navigation → restore English. Phone and website language preferences are separate.
3. **Updates** → unread update → **Mark all as seen** to show the phone inbox.
4. Return to farmer@demo.local if faculty want another agriculture transaction; the textile section left the phone on weaver.

Explain the observed listing wizard's local-first behavior: Room stores local data before upload; WorkManager performs background sync. Local draft/syncing/quality-check/active states are different. Do not press **Check photos again** on the transaction listing during the core flow: that starts another grading pass rather than just viewing its old result.

## Complete page coverage checklist

All **27 implemented website page files** are covered here, including the three dynamic routes. Use this list if faculty ask what is implemented.

| Page / visible navigation label | Route | Section |
| --- | --- | --- |
| Public Home | `/` | 1 |
| How it works | `/services` | 1 |
| What you can sell | `/verticals` | 1 |
| Guides | `/blog` | 1 |
| Public Pricing | `/pricing` | 1 |
| Log in | `/login` | Preparation, 1 |
| Create account | `/register` | 1 |
| Forgot password | `/forgot-password` | 19 |
| Reset password | `/reset-password?uid=...&token=...` | 19 |
| Buyer Home | `/buyer/dashboard` | 2 |
| Market | `/buyer/catalog` | 2 |
| Listing detail | `/buyer/catalog/<id>` | 2, 7, 8 |
| What I need | `/buyer/requirements` | 3 |
| Offers | `/buyer/offers` | 7, 8 |
| My orders | `/buyer/orders` | 3, 9 |
| Check a price | `/buyer/estimate` | 4, 15 |
| Updates | `/buyer/notifications` | 10 |
| Verifier Home | `/verifier/dashboard` | 6 |
| Photos to check | `/verifier/queue` | 6 |
| Full review | `/verifier/queue/<id>` | 6, 11 |
| Admin Home | `/admin/dashboard` | 12 |
| Categories | `/admin/verticals` | 14 |
| Category editor | `/admin/verticals/<id>` | 14, 15 |
| Quality checks | `/admin/verification` | 16 |
| Complaints | `/admin/disputes` | 17 |
| People | `/admin/users` | 18 |
| Market prices | `/admin/pricing` | 13 |

## Prepared photographs and fallback listings

These dataset cases were uploaded and graded. Original files on the phone and backend were verified by SHA-256. They started Pending verification; if you review one, it will no longer appear in the pending queue.

| ID | Seller | Variety / case | Observed AI result |
| --- | --- | --- | --- |
| 76 | farmer | Phone review check | Grade C, 57.92% |
| 77 | farmer | Real dataset - Wheat source A | Grade C, 57.92% |
| 78 | farmer | Real dataset - Wheat source D | Grade C, 57.92% |
| 79 | farmer | Real dataset - Wheat source F | Grade C, 57.92% |
| 80 | weaver | Real dataset - Cotton slub | Grade C, 57.03% |
| 81 | weaver | Real dataset - Cotton knot | Grade C, 57.03% |
| 82 | weaver | Real dataset - Cotton oil | Grade C, 50.83% |
| 83 | weaver | Real dataset - Cotton hole | Grade C, 57.03% |
| 84 | farmer | Real dataset - Wheat green-sheet reference | Grade A, 57.92% |

Phone: **Pictures/YieldnYarnReal**. Laptop originals: `.demo/real-images/photos/`. The green-sheet reference overlaps the documented training-source collection and is not an independent accuracy test. Full provenance/results: [image-results.md](image-results.md).

Do not rerun `infra/local/check-real-images.py` after manual approvals just to restore a screen: that integration rehearsal regrades its named cases and changes review state. Use a still-pending case or create a fresh phone listing instead.

## Accurate explanations for faculty

| Topic | What to say |
| --- | --- |
| Architecture | Android/Room/WorkManager; Next.js website; Django REST transactions; PostgreSQL; FastAPI grading/pricing/matching; phone uses USB forwarding in this local build. |
| AI | Trained MobileNetV3 Small checkpoints and image-analysis logic. Real independent images expose actual outputs and misclassification; arbitrary-camera accuracy is not established. |
| Confidence | Current checkpoint caps are about 57.92% wheat and 57.03% fabric, below the 80% auto-approval threshold. Current AI results therefore need human review; repeated confidence values are expected. |
| Quality | Higher percentages are better. Photo grading covers wheat cleanliness/whole grains and fabric defect quality; it does not measure moisture, GSM or thread count. |
| Human review | Manual corrections change the latest grade/visibility with a note; they do not retrain the model. |
| Pricing | Market base × grade multiplier × highest qualifying quantity-tier multiplier. Estimates, listing prices and accepted bid prices are separate. |
| Data | Historical/manual prices and Agmarknet-tagged offline fixtures are seeded local review data, not a freshly fetched live feed. |
| Matching | Creates orders with actual allocations and stock reduction. The website's Place text is not GPS filtering. |
| Payments / fulfilment | Agreed orders and complaints are implemented. Payment wording is explanatory; no live gateway, shipping/refund integration or website delivery-status editor is demonstrated. |
| Notifications / email | In-app updates work. Local Firebase push is not configured; reset emails are emitted to the Django log. |

## Finish and restore settings

- Both categories: **Grade A +10%, Grade B 0%, Grade C −12%**.
- Agriculture tiers: **0 / 0%, 50 / 2%, 200 / 5%**. Remove the optional 500 / 7% tier and Save changes.
- Textile tiers: **0 / 0%, 500 / 3%, 2000 / 6%**.
- Remove `faculty_visual_note` and temporary FacultyGrade; save and refresh to confirm baseline configuration.
- Leave toggled accounts active. Keep prepared account passwords at Demo@12345. The optional fresh account uses its new password after the reset demonstration.
- Restore English and any edited seller profile values.
- Keep created listings/orders/complaints/demo prices as demonstration evidence. Inventory and counts now differ from the starting snapshot.
- Keep servers running through questions. Later `.\stop-demo.ps1` stops app servers while retaining database data.

Closing statement: **“I showed the same inventory moving from phone photos through grading and human approval into negotiations, orders, stock changes and complaint handling. Admin schema and price rules are editable, and the live estimator reflects the stored rules. The independent photos also show where human review is necessary.”**
