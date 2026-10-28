# YieldnYarn faculty demonstration — 9 October 2026

For the **complete website implementation**, follow **[website-walkthrough.md](website-walkthrough.md)**. It covers all 27 website pages with exact navigation, form entries, actions and expected results, including administrator schema editing, price entry, live price-rule changes, account activation and complaint escalation. This file is the shorter phone/photo narrative. Both walkthroughs are now copied to **Download → YieldnYarnReview** on the attached phone. The review readiness check passed **34/34** checks on 9 October; USB forwarding and all 15 original photographs were verified.

Allow 20–25 minutes. Use the laptop for buyer/checker/admin and the connected phone for sellers. The objective is to show one complete transaction, both business verticals, bulk matching and the human review of actual dataset photographs.

## Before faculty arrive

1. Connect and unlock the phone. Keep USB debugging authorized. In this project's PowerShell window run `./start-demo.ps1 -SkipSeed`.
2. Open <http://localhost:3000>. Use different browser profiles for buyer and checker/admin, or use the normal window for buyer and a private window for checker. Two tabs in the same profile share a login; private windows in the same private session also share it.
3. Every account below uses **Demo@12345**:

| Device/window | Account | Role |
| --- | --- | --- |
| Phone initially | farmer@demo.local | Agriculture seller |
| Laptop normal window | buyer@demo.local | Buyer |
| Laptop separate/private window | checker@demo.local | Human verifier |
| Separate window later | admin@demo.local | Administrator |
| Phone later | weaver@demo.local | Textile seller |

4. On the phone, open Gallery → Collections → From this device → **YieldnYarnReal**. The album contains 15 original dataset photos. If the gallery wording differs, use the phone Files app → Pictures → YieldnYarnReal. Their original dates can place them away from the newest photos; use the album rather than Recent.
5. Run the readiness check if desired: `./.demo/venv/Scripts/python.exe infra/local/check-demo.py`. Keep the laptop awake and the USB cable connected.

The older **YieldnYarnDemo** album contains generated sample images. Use **YieldnYarnReal** for this review. Downloading is already complete; the photos, models, prices and running services are local.

## Opening explanation — 1 minute

Say: “YieldnYarn connects small agriculture and textile sellers with buyers. A seller uploads inventory and photos from Android. The system suggests quality scores, routes uncertain cases to a human checker, and supports prices, negotiation, orders and bulk purchases.”

If asked about architecture: Android uses Room for saved drafts and WorkManager for background sync; Next.js provides buyer/checker/admin screens; Django handles users and marketplace transactions; PostgreSQL stores records; FastAPI runs grading, pricing and matching. USB forwarding connects this phone build to the laptop's APIs.

## 1. Buyer marketplace and bulk matching — 3 minutes

1. As buyer, show the dashboard, then `/buyer/catalog`. Open Wheat and Cotton fabric. Point out photos, seller, quality, price, remaining stock and the different units: quintals versus metres.
2. Demonstrate bulk matching **before accepting large wheat offers**. Open `/buyer/requirements`, choose **Add what you need**, and enter:
   - Agriculture; Wheat; **100 quintals**; minimum **Grade B**; maximum **₹3,000/unit**; place **Madhya Pradesh**.
3. Click **Save and find sellers**. Matching starts automatically; for a request that remains Open, its row has **Find sellers** for retrying. Open `/buyer/orders`, expand the resulting order row, and show its seller allocations and total quantity.
4. Explain: “No prepared seller lot individually has 100 quintals, so the matcher combines stock from multiple sellers.” The original eligible wheat lots are 40, 80 and 65 quintals. Matching consumes stock, so use a smaller request if rehearsals have already reduced it.

The place field is descriptive. Actual distance filtering requires coordinates through the API. Do not describe this text field as performing GPS matching.

## 2. Prices and budgeting — 2 minutes

Open `/buyer/estimate`: Agriculture → Wheat → 100 → Grade A. Show the price history, adjusted unit price and total; change quantity or minimum grade. Repeat Textiles → Cotton fabric → 100 metres.

Say: “These prices are seeded local review records. The calculation is live, while today's market feed is represented by offline fixtures.” This keeps the demonstration independent of Internet access and live feed availability.

## 3. Create a listing from actual photos on the phone — 4 minutes

As `farmer@demo.local`, show Home, My items and Offers. Then tap **Sell something**:

1. **Type:** Agriculture.
2. **Product:** Wheat. **Variety:** `Faculty wheat live`. **State:** Madhya Pradesh.
3. **Quantity:** 2 quintals. **Your price:** ₹2,450/quintal. Show the state market-price suggestion before proceeding. Location is optional.
4. **Photos:** Gallery → Collections → From this device → YieldnYarnReal. Select **wheat-source-A-1.jpg** and **wheat-source-A-2.jpg**. These are real photographs of wheat on a dark sheet; one contains a coin. File names can be viewed in Files/Gallery details. They are two views/examples, not proof of one physical seller lot.
5. Review and tap **Put up for sale**. Show the saved notification, return to My items and pull down to refresh. Open `Faculty wheat live` when it appears.
6. Show both photos, the grade, quality attributes and **Quality check** status. The rehearsal predicted **Grade C, confidence 57.92%** for this pair; do not promise a different result.

Say: “The image is stored on the phone first, then sent to the laptop. These are actual dataset photographs, and this grade was computed now.”

If the live listing is delayed, use the prepared **Real dataset - Wheat source A**, listing **77**. Its photos already completed upload and grading. Keep the failed/delayed state visible and distinguish the prepared example from your new submission.

## 4. Human checking and AI limitations — 3 minutes

1. In the checker window open `/verifier/queue`. Find the new Wheat listing; use its listing number to distinguish it from other wheat cases. Prepared independent-image cases **77–83** are also queued.
2. Open the listing, inspect both photos at full size, and show the AI grade/confidence and quality fields.
3. Explain the observed limitation: “The independent source labels these pictures Grade A, but our prototype predicts Grade C. Its visible-quality criteria and capture conditions differ from the source collection, and this sample shows a misclassification. It therefore requires human review.” Source grade labels are not a one-to-one validation of YieldnYarn's attribute scores.
4. To demonstrate correction, enter an explicitly **illustrative verifier assessment**, for example **95** for Clean and **95** for Whole grains. Add the required note: `Faculty demonstration: illustrative manual assessment after photo inspection; AI output retained for comparison.` Click **Approve with my scores**. Higher percentages mean better quality; these are not defect percentages. Both 95% scores produce Grade A under the current weights.
5. Refresh the buyer catalog and phone listing. Show that the listing is now available and uses the verifier's result. Explain that the improved grade is a human decision, not an improved model prediction or a laboratory quality certification.

All current checkpoint confidence caps are below the 80% automatic-approval threshold, so every current AI result routes to the checker. Repeated ~58% confidence values are expected from that cap. Moisture and thread count are not measured from these photos.

## 5. Negotiation to confirmed order — 3 minutes

1. On the buyer laptop, open the newly approved `Faculty wheat live` listing. Make an offer for **1 quintal at ₹2,300/unit**.
2. On the farmer phone, open Offers and refresh. Show the buyer, quantity, offered price and total. Tap **New price**, enter **₹2,400/unit** for **1 quintal**, and send the counter.
3. On the laptop open `/buyer/offers`, refresh, and accept the counter that needs the buyer's response.
4. Open `/buyer/orders`. Show the new confirmed order: **1 quintal × ₹2,400 = ₹2,400**. Refresh the listing to show **1 quintal remaining**.
5. Show buyer notifications and phone Updates. These are in-app notifications; Firebase push is not configured.

Prepared fallback: the original soybean negotiation has a counter at ₹4,520/quintal. Using a fresh small wheat offer makes the end-to-end transition easier to follow without consuming the bulk-matching examples.

## 6. Textile vertical with real defects — 2 minutes

1. Log out on the phone, then sign in as **weaver@demo.local**. Show Cotton fabric and Denim inventory measured in metres.
2. Open **Real dataset - Cotton hole**, listing **83**, then **Real dataset - Cotton oil**, listing **82**. Show the real photos and their stored AI quality results. The source filenames identify holes and oil spots; the app reports estimated defect scores rather than class names.
3. In the checker window open `/verifier/queue/83`. Show the hole photo and human review. For a rejection example, add `Visible holes in the supplied dataset photos; please submit a suitable replacement sample.` and click **Send back to seller**. Refresh the weaver inventory to show that the listing returned to **Draft**.

All textile source examples contain defects. We did not label any of these photos “defect-free.” You can create another Cotton fabric listing through the same phone wizard using `cotton-hole-1.jpg` and `cotton-hole-2.jpg` if time permits.

## 7. Complaints, administration and usability — 3 minutes

1. As buyer open `/buyer/orders`. Show the seeded pending, confirmed, delivered, disputed and cancelled examples. Open your confirmed trade and demonstrate raising a complaint with an explicit review-example description.
2. As admin open `/admin/disputes`. Inspect an open complaint, add a resolution note and resolve it. Show that the status changed.
3. Follow sections 12–18 of **[website-walkthrough.md](website-walkthrough.md)** for the exact administrator actions: price entry, quality-schema editing, a live price-rule change with calculated before/after totals, approval, complaint resolution/escalation and account activation. The guide includes restoration steps after configuration edits.
4. Show the buyer website or phone language controls and switch English/Hindi, then restore English. Admin and verifier page content stays English. Open buyer Updates and the Ctrl+K navigation menu.

The order histories are seeded examples. This version has no delivery-management UI or payment processing; the order is a marketplace record, not a bank transaction.

## Optional: demonstrate a draft while the laptop is unreachable

Do this last, after the main transaction is complete. Start the phone wizard while connected so its verticals are loaded, then unplug USB before saving a small new listing with a distinct name such as `Faculty disconnected draft`. Show that it stays saved/pending locally when the backend is unreachable.

Reconnect USB, rerun `./start-demo.ps1 -SkipSeed`, and pull down to refresh My items, which also requests foreground sync. Show that the same draft reaches the backend; WorkManager handles background retries too. USB carries the local backend connection, so turning off phone mobile data alone does not demonstrate that this API is unreachable. Scheduling/retries can take time; never promise an immediate background retry.

## Real-image results and faculty questions

The complete run and source links are in [image-results.md](image-results.md). Fifteen phone files were checked against the laptop originals by SHA-256; no pixels were generated, composited or altered for this set. Eight prepared dataset listings are retained, **77–84**, all awaiting verification at the time of testing.

| Question | Answer supported by this project |
| --- | --- |
| Where did the real photos come from? | Sanjay Deshmukh's Wheat Grading & Type dataset, Defect Spectrum's cotton image collection, and one AgroAI reference. Show the source links and file manifest. |
| Is this an unseen accuracy test? | The six independent wheat and eight cotton samples come from different documented collections from the training sources; the AgroAI reference overlaps a training-source collection. Eight cases are an integration rehearsal, not an accuracy benchmark. |
| Why did clean wheat get Grade C? | It misclassified these independent samples. Capture/background differences are a plausible factor, but the cause has not been established. The verifier workflow allows corrections. |
| What does 0% Clean mean? | It is a quality score: higher is better. It does not mean 0% foreign material. The report separately includes the model's estimated bad-item share. |
| Why is confidence almost constant? | It is capped by checkpoint validation balanced accuracy, below the automatic-approval threshold. |
| What is measured by the AI? | Visible kernel/foreign-particle classes and fabric patch defects. Moisture, thread count, chemical safety and physical weight require separate measurements. |
| Does it work locally? | The web, APIs, PostgreSQL, checkpoints and images are local. This installed phone build reaches laptop APIs through USB forwarding. |
| What happens with a large buy request? | Matching creates an order with allocations from multiple available sellers and reduces stock. |

Finish by showing the confirmed small trade, the bulk order's allocations, and the real-photo verifier decision. These are the three strongest end-to-end outcomes.
