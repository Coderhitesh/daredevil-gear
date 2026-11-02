# Excel → database mapping

Source: `backend/data/DDG_WEBSITE_PRODUCT_DETAILS_Corrected.xlsx` (override with `--file=`).
Code: `backend/src/services/import/` — `excel-reader.js` (reads cells, formula results, `#REF!`), `product-parser.js` (normalises and validates, no DB access), `catalog-map.js` (departments, collections, brands), `product-importer.js` (idempotent upsert), `report-writer.js` (reports in `backend/reports/`).

```bash
cd backend
npm run seed:products -- --dry-run      # report only, no writes
npm run seed:products                   # apply (safe to re-run)
```

The same importer runs from Admin → Import from Excel (dry run first, then apply).

## Sheets

| Sheet | Role | Header detection |
| --- | --- | --- |
| `Products` | Main catalogue: category group, name, description, features/specs, base & inclusive price, GST % | Finds the header row by column names, tolerant of merged two-row headers ("Website price" / "Base", "Incl.") |
| `Engine OIl` | Oils: name, stock qty, pack size, specs, key features, base price, GST %, inclusive price, review notes | Same |
| `Dare Devil All Product` | Pricing master: base, GST %, inclusive, packaging cost, chargeable weight, delivery zone, HSN, GST rule, fixed GST | Same |
| `Remove Product ` | Hide / remove lists and old-site pages to drop | Column headers become list names |

Rows from the three product sheets are merged by a normalised name key (`nameKey`: lower-case, punctuation and sizes normalised). The merged record carries `source.sheet` and `source.row` for every field.

## Field mapping

| Source column | Product field | Notes |
| --- | --- | --- |
| Article Name / Product Name | `name`, `slug`, `sourceKey` | "(Remove)" stripped from the display name and sets status `archived` |
| Product Categories (group) | `source.sourceCategory`, collection membership | Spelling normalised (e.g. "Soldiers Accessories") |
| — (derived) | `category` | Department by keyword rules in `catalog-map.js` (first match wins) |
| — (derived) | `sku` | `DDG-<DEPT>-NNN`, allocated once per `sourceKey`, never reused |
| Name prefix "DareDevil"/"Flemex" | `brand` | Own brand vs third-party brand |
| Product Description | `description`, `shortDescription` | Double spaces/newlines → paragraphs; short description = first paragraph, ≤ 220 chars |
| Features / Specification / Key Features | `specifications[]` and `features[]` | `Label: value` lines → specs; other lines → bullets. Specs with placeholders (`TO ADD`, `TBD`, `confirm …`) or internal notes ("only with report on file") are kept but `isPublic: false` |
| Website price (Incl.) / Price incl. GST | `pricing.priceInclusive` (paise) | Customer price |
| Website price (Base) / Base price | `pricing.sourceBasePrice` (paise) | Reference only; reconciled against inclusive ÷ (1 + GST) |
| GST % / GST Rule / Fixed GST | `pricing.gstRule`, `pricing.gstRate` | `apparel_threshold` for apparel/footwear (≤ ₹2,500 ex-GST per piece → 5 %, else 18 %), otherwise `fixed` |
| HSN | `hsnCode`, `hsnVerified: false` | Marked indicative in the source |
| Packaging cost | `packagingCharge` (paise) | Shown separately in cart/checkout per the packaging mode setting |
| Chargeable weight | `weightKg` | `#REF!` in the source → not set; checkout uses the default item weight (1 kg) |
| Delivery zone | (shipping rate cards) | Zone formula used to derive the Normal/Local/Special weight slabs in `seed-content.js` |
| Stock Qty (oils) | `ProductVariant.stock` via an `import` inventory movement | Other products get no stock |
| Pack size | `compliance.netQuantity` | Oils |
| Review Notes (oils) | blocking flag `source_price_unconfirmed` | Holds the product in review |
| Photo / Product Image | — | Not usable (no files supplied); `image_missing` warning |

## Validation and status

Each record gets `flags[]` (from the compliance scanner) and `issues[]` (data problems). Status is decided in this order:

1. "(Remove)" in the name or on the Remove list → `archived`
2. On the Hide list → `draft`
3. Any blocking flag (unverified protection/safety/standards claim, "military-grade", endorsement claims, restricted item, force insignia) or legal review needed → `review`
4. Missing content → `review`
5. Validation errors (e.g. invalid price) → `draft`
6. Otherwise → `published`

Restricted rules also set `compliance.minAge` (18), `domesticOnly`, `dangerousGoods`, `returnable` and `legalReview.required` where applicable.

## Idempotency and manual edits

- Records upsert by `sourceKey`. A SHA-256 content hash of the normalised record skips unchanged products (`unchanged` in the report).
- Fields edited in the admin are recorded in `manuallyEditedFields` and are never overwritten by later imports.
- Re-imports never change an existing product's status, except to archive a product newly marked "(Remove)" or put on the Remove list. Live stock is kept; differences are reported.
- Hide/Remove entries are stored in `CatalogBlocklist`; creating a product with a blocklisted name warns the admin.

## Reports (`backend/reports/`)

| File | Content |
| --- | --- |
| `import-report.md` | Summary counts, products needing review with evidence, archived items, reconciliation, GST checks, duplicates, list matches, skipped rows |
| `import-report.json` | Same, machine-readable (git-ignored) |
| `price-reconciliation.csv` | Base, GST %, expected and supplied inclusive price per row |
| `products.csv` | Final SKU, name, department, status, price, GST rule/rate, HSN, packaging, stock |

Result for the supplied workbook: 139 source rows → 70 products (58 published, 9 in review, 3 archived), 1 row skipped, all prices reconcile, no GST rule inconsistencies.
