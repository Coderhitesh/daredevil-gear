# Business decisions

Decisions taken during the build so work was not blocked, and the open items only the business can close. Every open item is also visible in Admin → **Launch checklist** and in the yellow strip at the top of the admin.

## A. Must be supplied or confirmed before launch

| # | Item | Where it is used | Current state | Where to fix |
| --- | --- | --- | --- | --- |
| 1 | Registered legal name, CIN (if a company), full registered address | Footer, contact page, invoices, policies | Not supplied | Admin → Store settings → Business details |
| 2 | GSTIN `09AAJCD6096M1ZV` | Tax invoices | Taken from the fix plan ("as listed on TradeIndia"); unverified | Same; tick "checked on the GST portal" |
| 3 | Grievance Officer name, designation, email, phone | Grievance page (mandatory under Consumer Protection (E-Commerce) Rules, 2020) | Not supplied | Store settings → Grievance officer |
| 4 | GST treatment: apparel/footwear threshold, GST on delivery and packaging, every HSN code | Checkout tax split and invoices | Implemented as in the sheet; HSN codes are marked "indicative" in the source | Admin → GST & tax (CA sign-off), each product's HSN |
| 5 | Policy pages (shipping, returns & refunds, cancellation, privacy, terms, grievance, payment, product safety, warranty, FAQ, about) | Storefront `/pages/*` | Drafted for India with highlighted placeholders; not legal advice | Admin → Pages & policies (legal review) |
| 6 | Courier rate card | Delivery charge at checkout | "Normal zone" weight slabs derived from the sheet formula, active; Local and Special zones defined but inactive (no area given) | Admin → Shipping |
| 7 | Product weights | Weight-slab delivery charges | Sheet weights are `#REF!`; 1 kg fallback per item | Each product → Pricing & GST → weight |
| 8 | Stock quantities | Availability | Supplied only for engine oils; everything else is 0 (out of stock) in production | Admin → Inventory → Adjust |
| 9 | Product photos | All product pages | None supplied; branded placeholder shown | Product → Photos (Cloudinary) |
| 10 | Legal Metrology declarations (origin, manufacturer/packer/importer, net quantity, consumer care) | Product pages | Mostly missing | Product → Compliance |
| 11 | Razorpay account, live keys, webhook | Payments | Not configured | `backend/.env`, see PRODUCTION_READINESS.md |
| 12 | SMTP mailbox (e.g. `sales@daredevilgears.com` via Google Workspace/Zoho/SES) | OTP, order emails | Not configured | `backend/.env` |
| 13 | Free-delivery threshold ₹5,000 | Cart/checkout | From the fix plan; confirm | Store settings → Shipping |
| 14 | Packaging charge shown separately vs built into price | Cart/checkout/invoice | Shown separately as in the sheet; the fix plan suggests building it into the price | Store settings → Checkout |

## B. Products held back (status "In review")

These are not visible on the store until resolved in Admin → Products → (product) → Compliance checks.

| Product | Why | What the business needs to do |
| --- | --- | --- |
| Sports Tactical Glasses (DDG-EYE-003) | Claims ANSI Z87.1 / Z87 compliance | Upload the test report and mark it verified, or remove the claim |
| Seeker 23 Laptop Backpack – Topo Grey (DDG-BAG-003) | "Military-grade" | Remove or substantiate |
| Stun Gloves – Restricted Sale (DDG-TAC-004) | Stun device; legal status unclear | Legal opinion before any sale; otherwise archive |
| Combat Rucksack 95 L (DDG-BAG-009) | "Designed to meet Indian Army standards" | Name the standard and hold evidence, or remove |
| Dhanush Commando Bag (DDG-BAG-011) | "Trusted by professionals" endorsement | Remove or name a verifiable user |
| Soldiers Personal Accessories Bag (DDG-BAG-013) | "Military-grade" | Remove or substantiate |
| Multigrade IC Engine Oil 20W-40 1 L (DDG-VGC-003) | Sheet note: ₹999 vs ₹249 for a similar 1 L oil; grade unclear | Confirm grade and price |
| Fully Synthetic Motor Oil 5W-40 (DDG-VGC-007) | "API SN Certified" | Hold the licence/certificate or remove |
| Tactical Gloves (DDG-APP-007) | No description or specifications in the sheet | Supply content |

Three products marked "(Remove)" are archived (kept for history, never sold): Army-Pattern Tactical Plate Carrier, Army-Pattern Combat Bag 35 L, Army-Pattern ROP Team Bag 25 L.

## C. Decisions taken

1. **One menu, one department per product.** The sheet's brand groups (Adventure Maniacs, Soldiers Accessories, Warrior Men, Memsahab Corner, Engine Oil) are mapped to 11 shopping departments by keyword rules (`services/import/catalog-map.js`) and kept as curated collections. Empty departments are hidden automatically.
2. **SKU scheme** `DDG-<DEPT>-NNN` (e.g. `DDG-BAG-001`), assigned once and never reused.
3. **Prices are GST inclusive** exactly as in the sheet; the base price is kept for reference only. All 70 rows reconcile to the paisa.
4. **No discounts at launch.** The sheet has no genuine reference prices, so no struck-through prices are shown. A sale requires a recorded reason and evidence of the regular price.
5. **No reviews or ratings at launch.** Only customers who received the product can review; nothing is seeded.
6. **Pepper spray is listed** (Personal Safety) as 18+, India-only, dangerous goods, non-returnable unless damaged. Stun devices and anything with force insignia need legal review. Items on the "Remove" sheet (force caps/hats, body armour, bulletproof jackets, ballistic helmets) are blocklisted so they cannot be re-created by accident.
7. **"Training & Tactical Gear"** helmets/vests are described as non-ballistic; no protection rating is implied anywhere.
8. **Cash on delivery is off.** Online payment through Razorpay only.
9. **Guest checkout is on**; guests receive a private order link by email. Can be switched off in Store settings.
10. **International orders**: quote on request only (contact/bulk form), not at checkout.
11. **Returns**: 7-day window after delivery by default (per product), damaged/wrong items reported within 48 hours. Confirm in the policy review.
12. **Hide-list fuzzy match not applied**: "Jungle Shoes" on the hide list may refer to "DareDevil Anti-Spike Jungle Shoes", which remains published. Confirm.
13. **Competitor and current-site review**: the existing site and competitor sites could not be fetched from the build environment; design decisions were based on the logo, the fix plan and the product data.
