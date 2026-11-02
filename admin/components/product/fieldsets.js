/** Field definitions for the product editor, grouped by tab. */

export const GST_RATES = [0, 5, 12, 18, 28, 40].map((r) => [String(r), `${r}%`]);

export function detailsFields({ categories, brands }) {
  return [
    { name: 'name', label: 'Product name', required: true, span: 2 },
    { name: 'slug', label: 'URL slug', hint: 'Changing it breaks old links — add a redirect if the product was live' },
    { name: 'category', label: 'Category', type: 'select', required: true, options: categories.map((c) => [String(c._id), `${'— '.repeat(c.ancestors?.length || 0)}${c.name}`]), placeholder: 'Choose a category' },
    { name: 'brand', label: 'Brand', type: 'select', nullable: true, options: brands.map((b) => [String(b._id), b.name]), placeholder: 'No brand' },
    { name: 'tags', label: 'Tags', type: 'list', hint: 'Comma separated, used by search' },
    { name: 'variantGroup', label: 'Variant group', hint: 'Products sharing this group are linked as colour/size options of each other' },
    { name: 'variantLabel', label: 'Label within the group', hint: 'For example "Olive Green"' },
    { name: 'shortDescription', label: 'Short description', type: 'textarea', rows: 2, hint: 'One or two sentences under the title. No unverifiable claims.' },
    { name: 'description', label: 'Description', type: 'html', rows: 10, hint: 'Simple HTML allowed (paragraphs, lists, bold). Scanned for restricted claims on save.' },
    { name: 'features', label: 'Key features', type: 'lines', rows: 6, hint: 'One per line' },
    { name: 'isFeatured', label: 'Feature this product on the homepage', type: 'checkbox' },
  ];
}

export function pricingFields() {
  return [
    { name: 'pricing.priceInclusive', label: 'Selling price (incl. GST)', type: 'money', required: true, hint: 'What the customer pays per unit, GST included' },
    { name: 'pricing.gstRule', label: 'GST rule', type: 'select', required: true, options: [['fixed', 'Fixed rate'], ['apparel_threshold', 'Apparel/footwear threshold (5% up to ₹2,500 per piece, else 18%)']] },
    { name: 'pricing.gstRate', label: 'GST rate', type: 'select', numeric: true, required: true, options: GST_RATES, show: (v) => v.pricing?.gstRule !== 'apparel_threshold', hint: 'Confirm with your accountant' },
    { name: 'hsnCode', label: 'HSN code', hint: '4–8 digits. Printed on the tax invoice.' },
    { name: 'hsnVerified', label: 'HSN confirmed by accountant', type: 'checkbox' },
    { name: 'packagingCharge', label: 'Packaging charge (incl. GST)', type: 'money', hint: 'Shown separately in the cart and invoice' },
    { name: 'weightKg', label: 'Shipping weight (kg)', type: 'number', step: '0.01', hint: 'Used for weight-slab delivery rates' },
    { name: 'dimensionsCm.l', label: 'Length (cm)', type: 'number' },
    { name: 'dimensionsCm.w', label: 'Width (cm)', type: 'number' },
    { name: 'dimensionsCm.h', label: 'Height (cm)', type: 'number' },
    { name: 'sale', label: 'Sale price', type: 'heading' },
    { name: 'pricing.sale.active', label: 'Run a sale on this product', type: 'checkbox', hint: 'Only for genuine reductions from a price you actually charged' },
    { name: 'pricing.sale.priceInclusive', label: 'Sale price (incl. GST)', type: 'money', show: (v) => v.pricing?.sale?.active },
    { name: 'pricing.sale.reason', label: 'Reason', show: (v) => v.pricing?.sale?.active, placeholder: 'Diwali sale' },
    { name: 'pricing.sale.startsAt', label: 'Starts', type: 'datetime', show: (v) => v.pricing?.sale?.active },
    { name: 'pricing.sale.endsAt', label: 'Ends', type: 'datetime', show: (v) => v.pricing?.sale?.active },
    { name: 'pricing.sale.referencePriceEvidence', label: 'Evidence for the regular price', type: 'textarea', rows: 2, required: true, show: (v) => v.pricing?.sale?.active, hint: 'Where and when the regular price was charged (e.g. "sold at ₹3,538 on this site Jan–Mar 2026"). Required by consumer-protection rules for struck-through prices.' },
  ];
}

export function complianceFields() {
  return [
    { name: 'lm', label: 'Legal Metrology (packaged goods) declarations', type: 'heading' },
    { name: 'compliance.countryOfOrigin', label: 'Country of origin', placeholder: 'India' },
    { name: 'compliance.netQuantity', label: 'Net quantity', placeholder: '1 N (one unit)' },
    { name: 'compliance.manufacturer.name', label: 'Manufacturer name' },
    { name: 'compliance.manufacturer.address', label: 'Manufacturer address' },
    { name: 'compliance.packer.name', label: 'Packer name' },
    { name: 'compliance.packer.address', label: 'Packer address' },
    { name: 'compliance.importer.name', label: 'Importer name', hint: 'For imported goods' },
    { name: 'compliance.importer.address', label: 'Importer address' },
    { name: 'compliance.consumerCare', label: 'Consumer-care contact', span: 2, placeholder: 'support@… / +91…' },
    { name: 'safety', label: 'Safety & restrictions', type: 'heading' },
    { name: 'compliance.safetyInstructions', label: 'Safety instructions', type: 'textarea', rows: 3 },
    { name: 'compliance.warnings', label: 'Warnings', type: 'lines', rows: 3, hint: 'One per line, shown on the product page' },
    { name: 'compliance.minAge', label: 'Minimum buyer age', type: 'number', step: 1, min: 0, max: 21, hint: '18 for restricted items; buyers confirm their age at checkout' },
    { name: 'compliance.blockedStates', label: 'Do not ship to these states', type: 'list', hint: 'Comma separated state names' },
    { name: 'compliance.domesticOnly', label: 'India delivery only', type: 'checkbox' },
    { name: 'compliance.dangerousGoods', label: 'Dangerous goods (courier restrictions apply)', type: 'checkbox' },
    { name: 'returns', label: 'Returns', type: 'heading' },
    { name: 'compliance.returnable', label: 'Returnable', type: 'checkbox' },
    { name: 'compliance.returnWindowDays', label: 'Return window (days after delivery)', type: 'number', step: 1, min: 0, max: 60, show: (v) => v.compliance?.returnable },
  ];
}

export function seoFields() {
  return [
    { name: 'seo.title', label: 'Search title', hint: 'Up to 70 characters. Defaults to the product name.', span: 2 },
    { name: 'seo.description', label: 'Search description', type: 'textarea', rows: 3, hint: 'Up to 170 characters. Defaults to the short description.' },
    { name: 'seo.canonical', label: 'Canonical URL', span: 2, hint: 'Only if this page duplicates another' },
    { name: 'seo.noindex', label: 'Hide from search engines', type: 'checkbox' },
  ];
}
