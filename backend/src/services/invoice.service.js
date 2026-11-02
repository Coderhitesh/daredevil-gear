'use strict';

const { formatINR } = require('../shared');
const settings = require('./settings.service');
const { splitInclusive } = require('../utils/money');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money = (p) => formatINR(p, { decimals: 2 });

/**
 * Printable GST tax invoice (HTML; "Print → Save as PDF" in the browser).
 * Uses only the order snapshot — editing a product later never changes an invoice.
 */
async function renderInvoice(order, { taxConfig }) {
  const biz = await settings.get('business');
  const intra = order.pricing.supplyType === 'intra';
  const rows = order.items
    .map((i, idx) => {
      const half = Math.floor(i.taxAmount / 2);
      return `<tr>
<td>${idx + 1}</td>
<td>${esc(i.name)}${i.variantTitle && i.variantTitle !== 'Default' ? ` — ${esc(i.variantTitle)}` : ''}<div class="m">SKU ${esc(i.sku)}</div></td>
<td>${esc(i.hsnCode || '—')}</td>
<td class="r">${i.quantity}</td>
<td class="r">${money(i.taxableValue)}</td>
<td class="r">${i.gstRate}%</td>
${intra ? `<td class="r">${money(half)}</td><td class="r">${money(i.taxAmount - half)}</td>` : `<td class="r">${money(i.taxAmount)}</td>`}
<td class="r">${money(i.netTotal)}</td></tr>`;
    })
    .join('');

  const extraRow = (label, inclusive, rate) => {
    if (!inclusive) return '';
    const { taxable, tax } = splitInclusive(inclusive, rate);
    const half = Math.floor(tax / 2);
    return `<tr><td></td><td>${label}</td><td>${label === 'Delivery charge' ? '9965' : '—'}</td><td class="r">1</td><td class="r">${money(taxable)}</td><td class="r">${rate}%</td>${intra ? `<td class="r">${money(half)}</td><td class="r">${money(tax - half)}</td>` : `<td class="r">${money(tax)}</td>`}<td class="r">${money(inclusive)}</td></tr>`;
  };
  const pkgRate = order.items[0]?.gstRate ?? 18;
  const a = order.shippingAddress;
  const b = order.billingAddress || a;
  const pendingBiz = !biz.legalName || !biz.registeredAddress;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tax Invoice ${esc(order.invoice?.number || order.orderNumber)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1F2120;margin:32px;font-size:12px}
h1{font-size:18px;letter-spacing:1px;margin:0}
.top{display:flex;justify-content:space-between;border-bottom:3px solid #E94E19;padding-bottom:12px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px}
.box h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6B6E6A;margin:0 0 4px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #DDD7CB;padding:6px;vertical-align:top}
th{background:#F4F1EA;text-align:left;font-size:11px}
.r{text-align:right}.m{color:#6B6E6A;font-size:10px}
.tot td{font-weight:bold}
.warn{background:#FFF4E5;border:1px solid #E94E19;padding:8px;margin-bottom:12px}
@media print{body{margin:12mm}.noprint{display:none}}
</style></head><body>
<p class="noprint"><button onclick="window.print()">Print / Save as PDF</button></p>
${pendingBiz ? '<div class="warn"><strong>Draft:</strong> the seller legal name / registered address have not been configured (Admin → Settings → Business). This document must not be issued until they are.</div>' : ''}
<div class="top"><div><h1>TAX INVOICE</h1><div class="m">Original for recipient</div></div>
<div style="text-align:right"><strong>${esc(biz.legalName || biz.displayName)}</strong><br>${esc(biz.registeredAddress || biz.addressShort || '')}<br>GSTIN: ${esc(biz.gstin || '—')}${biz.cin ? `<br>CIN: ${esc(biz.cin)}` : ''}<br>${esc(biz.email)} · ${esc(biz.phone)}</div></div>
<div class="grid">
<div class="box"><h3>Invoice</h3>No: <strong>${esc(order.invoice?.number || 'Pending')}</strong><br>Date: ${new Date(order.invoice?.generatedAt || order.placedAt || order.createdAt).toLocaleDateString('en-IN')}<br>Order: ${esc(order.orderNumber)}<br>Place of supply: ${esc(a.state)}</div>
<div class="box"><h3>Bill to</h3>${esc(b.companyName || b.fullName)}<br>${esc(b.line1)}${b.line2 ? ', ' + esc(b.line2) : ''}<br>${esc(b.city)}, ${esc(b.state)} ${esc(b.pincode)}${b.gstin ? `<br>GSTIN: ${esc(b.gstin)}` : ''}</div>
<div class="box"><h3>Ship to</h3>${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}<br>${esc(a.phone)}</div>
</div>
<table><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Taxable value</th><th class="r">GST</th>${intra ? '<th class="r">CGST</th><th class="r">SGST</th>' : '<th class="r">IGST</th>'}<th class="r">Total</th></tr></thead>
<tbody>${rows}
${extraRow('Packaging charge', order.pricing.packagingCharge, taxConfig?.packagingTaxMode === 'fixed' ? taxConfig.packagingFixedRate : pkgRate)}
${extraRow('Delivery charge', order.pricing.shippingCharge, taxConfig?.shippingTaxRate ?? 18)}
${order.pricing.codCharge ? extraRow('Cash on delivery fee', order.pricing.codCharge, taxConfig?.shippingTaxRate ?? 18) : ''}
<tr class="tot"><td colspan="4">Total</td><td class="r">${money(order.pricing.taxableTotal)}</td><td></td>${intra ? `<td class="r">${money(order.pricing.cgst)}</td><td class="r">${money(order.pricing.sgst)}</td>` : `<td class="r">${money(order.pricing.igst)}</td>`}<td class="r">${money(order.pricing.grandTotal)}</td></tr>
</tbody></table>
${order.pricing.offerDiscount ? `<p>Offers applied: ${(order.pricing.offers || []).map((o) => `${esc(o.name)} (${money(o.saving)})`).join(', ')} — already reflected in item values above.</p>` : ''}
${order.pricing.discount ? `<p>Coupon ${esc(order.pricing.couponCode)} applied: ${money(order.pricing.discount)} (already reflected in item values above).</p>` : ''}
${order.payment?.provider === 'cod'
  ? `<p>Payment: <strong>cash on delivery</strong> — ${order.payment?.status === 'captured' ? `${money(order.payment.amountPaid)} collected on delivery` : `${money(order.pricing.grandTotal)} to be collected on delivery`}.</p>`
  : `<p>Amount paid: <strong>${money(order.payment?.amountPaid || order.pricing.grandTotal)}</strong> via ${esc(order.payment?.method || 'online payment')} (Razorpay ${esc(order.payment?.razorpayPaymentId || '')}).</p>`}
<p class="m">Whether tax is payable on reverse charge: No. This is a computer-generated invoice.</p>
</body></html>`;
}

module.exports = { renderInvoice };
