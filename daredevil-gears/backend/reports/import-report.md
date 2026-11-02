# Product import & validation report

Generated: 2026-10-28T05:04:40.402Z  
Mode: **DRY RUN (no database changes)**

## Summary

| Metric | Count |
| --- | ---: |
| Total source rows (all product sheets) | 139 |
| Distinct products after merging sheets | 70 |
| Valid product records | 70 |
| Created | 0 |
| Updated | 0 |
| Unchanged (idempotent re-run) | 70 |
| Archived (removed from sale) | 0 |
| Skipped rows (headers / blank / no price) | 1 |
| Duplicate records | 2 |
| Missing images | 70 |
| Missing SKUs | 0 |
| Invalid prices | 0 |
| GST / price inconsistencies | 0 |
| Unresolved visibility conflicts | 1 |
| Products requiring manual review | 9 |

## Storefront visibility

- **published**: 58
- **review**: 9
- **archived**: 3

Only `published` products appear in navigation, listings and search. `review` items need content or legal sign-off in Admin → Products before they can be published.

## Products requiring manual review

### Sports Tactical Glasses (DDG-EYE-003) — review
- Safety standard claimed — show only with the test report on file
- Standards/certification claim — requires evidence
- Safety standard claimed — show only with the test report on file
- **claim_safety_standard**: Safety standard claimed — show only with the test report on file — “in extreme environments. Built to meet Z87 safety standards, the impact-resistant polycarbonate len”
- **claim_meets_standards**: Standards/certification claim — requires evidence — “of protection in extreme environments. Built to meet Z87 safety standards, the impact-resistant pol”
- **claim_safety_standard**: Safety standard claimed — show only with the test report on file — “Safety Standard: ANSI Z87.1 Compliant”

### DareDevil Seeker 23 Laptop Backpack - Topo Grey (DDG-BAG-003) — review
- "Military-grade" claim is unsubstantiated
- **claim_military_grade**: "Military-grade" claim is unsubstantiated — “bag combines functionality with rugged military-grade durability. With double compartments, padded”

### Stun Gloves - Restricted Sale (DDG-TAC-004) — review
- Stun device — legal review required before any sale
- Marked "Restricted Sale" in source data — legal review required
- **restricted_stun**: Stun device — legal review required before any sale — “Stun Gloves - Restricted Sale”
- **restricted_sale_label**: Marked "Restricted Sale" in source data — legal review required — “Stun Gloves - Restricted Sale”

### Combat Rucksack 95 L (DDG-BAG-009) — review
- Standards/certification claim — requires evidence
- **claim_meets_standards**: Standards/certification claim — requires evidence — “ear is made to perform under pressure. Designed to meet Indian Army standards, the rucksack feature”

### Dhanush Commando Bag - Olive Green (DDG-BAG-011) — review
- Endorsement/testing claim without a named user or test
- **claim_endorsement**: Endorsement/testing claim without a named user or test — “lon, this 35-litre tactical gear bag is trusted by professionals who demand Indian-made military gea”

### Soldiers Personal Accessories Bag - Olive Green (DDG-BAG-013) — review
- "Military-grade" claim is unsubstantiated
- **claim_military_grade**: "Military-grade" claim is unsubstantiated — “campers, and fitness enthusiasts, this military-grade waist bag blends rugged utility with organize”

### Multigrade IC Engine Oil 20W-40 (1 L) (DDG-VGC-003) — review
- Spreadsheet review note: Rs 999 for 1 L 20W-40 vs Rs 249 for Multi Power 20W-40 (also 1 L) - and spec says semi-synthetic. Confirm grade and price.
- **source_price_unconfirmed**: Spreadsheet review note: Rs 999 for 1 L 20W-40 vs Rs 249 for Multi Power 20W-40 (also 1 L) - and spec says semi-synthetic. Confirm grade and price.

### Fully Synthetic Motor Oil 5W-40 (3.5 L) (DDG-VGC-007) — review
- Standards/certification claim — requires evidence
- **claim_meets_standards**: Standards/certification claim — requires evidence — “API SN Certified: Superior wear protection, cleanliness, and sludge”

### Tactical Gloves (DDG-APP-007) — review
- Product content missing in the source data
- review: Only present in the pricing sheet — no description or specifications supplied

## Archived / removed products

- Army-Pattern Tactical Plate Carrier — Marked "(Remove)" in the source spreadsheet
- Army-Pattern Combat Bag 35 L — Marked "(Remove)" in the source spreadsheet
- Army-Pattern ROP Team Bag 25 L — Marked "(Remove)" in the source spreadsheet

## Price reconciliation (base × (1 + GST) vs supplied inclusive price)

All 70 rows reconcile to the paisa. Full table: `price-reconciliation.csv`.

## GST rule checks

Every "Apparel"/"Footwear" row matches the ≤ ₹2,500 → 5% / > ₹2,500 → 18% rule; every "Fixed" row matches its fixed rate.

> HSN codes in the sheet are marked "indicative". All HSN/GST classifications must be confirmed by the company’s CA before launch (Admin → Tax).

## Cross-sheet conflicts

No conflicting prices or categories between the Products / Engine Oil sheets and the "Dare Devil All Product" sheet.

## Duplicates

- Winter Shoes (Remove Product!3): Repeated entry in hide list (ignored)
- MICH Ballistic Helmet Level IIIA (Remove Product!9): Repeated entry in hide list (ignored)

## Hide / remove list matching

Possible matches that were **not** applied automatically:
- “Jungle Shoes” (hide list) ↔ DareDevil Anti-Spike Jungle Shoes

List entries that do not correspond to any product in this workbook (items/pages from the old website). They are stored in the catalogue blocklist so admins are warned if a product with that name is created:

- [hide] Winter Shoes
- [remove_page] BULLET PROOF
- [hide] Winter Shoes
- [remove] Medium Ankle Anti Spike shoes
- [remove_page] GIFT CERTIFICATE
- [hide] T shirt
- [remove] Concealed Bulletproof Jacket (NIJ)
- [remove_page] BRAND
- [hide] Tactical Bulletproof Jacket Level IV
- [remove] Anti glare, dark goggles
- [remove_page] DELIVERY INFORMATION
- [hide] Sub Zero Hand gloves
- [remove] Body Armor
- [remove_page] FREE ONE HOUR
- [hide] PASGT Ballistic Helmet (NIJ)
- [remove] Central Police Blue Cap — force uniform item - removed for legal reasons
- [hide] MICH Ballistic Helmet Level IIIA
- [remove] BSF Hat — force uniform item - removed for legal reasons
- [hide] MICH Ballistic Helmet Level IIIA
- [remove] CISF Cap — force uniform item - removed for legal reasons
- [hide] Jungle Shoes
- [remove] CRPF Cap — force uniform item - removed for legal reasons
- [hide] Hand Torch
- [remove] CRPF Hat - Jungle Pattern — force uniform item - removed for legal reasons
- [hide] Elbow guard
- [hide] Knee Guard
- [hide] Semi-Synthetic Motor Oil 1 Liter

## Skipped rows

- Products!2: No product name (sub-header or blank row)
