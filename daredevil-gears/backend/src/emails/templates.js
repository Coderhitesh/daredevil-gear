'use strict';

const { formatINR, ORDER_STATUS_LABEL } = require('../shared');

/**
 * Branded, responsive, table-based email layout (works in Gmail/Outlook).
 * Colours follow the storefront tokens: graphite #1F2120, signal orange #E94E19, stone #F4F1EA.
 */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function layout({ preheader = '', heading, intro, bodyHtml = '', cta, footerNote, business }) {
  const b = business || {};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif;color:#1F2120;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E2DDD2;">
<tr><td style="background:#1F2120;padding:20px 28px;border-bottom:4px solid #E94E19;">
<span style="font-size:20px;font-weight:800;letter-spacing:2px;color:#ffffff;">DAREDEVIL</span>
<span style="font-size:20px;font-weight:400;letter-spacing:2px;color:#E94E19;"> GEARS</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1F2120;">${esc(heading)}</h1>
${intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A3D3B;">${esc(intro)}</p>` : ''}
${bodyHtml}
${cta ? `<p style="margin:24px 0;"><a href="${esc(cta.href)}" style="display:inline-block;background:#E94E19;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:14px 24px;">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 28px;border-top:1px solid #EFEAE0;font-size:12px;line-height:1.6;color:#6B6E6A;">
${footerNote ? `<p style="margin:0 0 8px;">${esc(footerNote)}</p>` : ''}
<p style="margin:0;">${esc(b.displayName || 'DareDevil Gears')}${b.legalName ? ' · ' + esc(b.legalName) : ''}${b.gstin ? ' · GSTIN ' + esc(b.gstin) : ''}</p>
<p style="margin:4px 0 0;">${esc(b.email || '')}${b.phone ? ' · ' + esc(b.phone) : ''}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function otpBlock(code, minutes) {
  return `<p style="margin:8px 0 4px;font-size:13px;color:#6B6E6A;text-transform:uppercase;letter-spacing:1px;">Your one-time code</p>
<p style="margin:0 0 12px;font-size:34px;font-weight:800;letter-spacing:10px;color:#1F2120;font-family:'Courier New',monospace;">${esc(code)}</p>
<p style="margin:0 0 8px;font-size:14px;color:#3A3D3B;">This code expires in ${minutes} minutes and can be used once. Never share it with anyone — DareDevil Gears staff will never ask for it.</p>`;
}

function itemsTable(order) {
  const rows = order.items
    .map(
      (i) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #EFEAE0;font-size:14px;">${esc(i.name)}${i.variantTitle && i.variantTitle !== 'Default' ? ` <span style="color:#6B6E6A">(${esc(i.variantTitle)})</span>` : ''}<br><span style="font-size:12px;color:#6B6E6A;">SKU ${esc(i.sku)} · Qty ${i.quantity}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #EFEAE0;font-size:14px;white-space:nowrap;">${formatINR(i.netTotal)}</td></tr>`
    )
    .join('');
  const p = order.pricing;
  const line = (label, val, bold) =>
    `<tr><td style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700;' : 'color:#3A3D3B;'}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700;' : ''}">${val}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${rows}
${line('Items (incl. GST)', formatINR(p.itemsTotal))}
${p.discount ? line(`Coupon ${esc(p.couponCode || '')}`, '− ' + formatINR(p.discount)) : ''}
${p.packagingCharge ? line('Packaging', formatINR(p.packagingCharge)) : ''}
${line('Delivery', p.shippingCharge ? formatINR(p.shippingCharge) : 'Free')}
${p.codCharge ? line('Cash on delivery fee', formatINR(p.codCharge)) : ''}
${line(order.payment?.provider === 'cod' && order.payment?.status !== 'captured' ? 'Pay on delivery (cash / UPI)' : 'Total paid', formatINR(p.grandTotal), true)}
<tr><td colspan="2" style="padding:4px 0;font-size:12px;color:#6B6E6A;">Includes GST of ${formatINR(p.taxTotal)}</td></tr></table>`;
}

function addressBlock(a) {
  if (!a) return '';
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3A3D3B;"><strong>Delivering to</strong><br>${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}<br>${esc(a.phone)}</p>`;
}

/**
 * Template registry. Each returns { subject, heading, intro, bodyHtml, cta, preheader }.
 * Subject/heading/intro/footer can be overridden from Admin > Email templates.
 */
const TEMPLATES = {
  otp_verify: {
    label: 'Email verification code',
    critical: true,
    build: ({ code, minutes }) => ({
      subject: `${code} is your DareDevil Gears verification code`,
      heading: 'Verify your email',
      intro: 'Use the code below to verify your email address and activate your account.',
      bodyHtml: otpBlock(code, minutes),
      preheader: 'Your verification code',
    }),
  },
  password_reset: {
    label: 'Password reset code',
    critical: true,
    build: ({ code, minutes }) => ({
      subject: 'Reset your DareDevil Gears password',
      heading: 'Password reset requested',
      intro: 'Enter this code on the reset page to choose a new password. If you did not request this, you can ignore this email — your password will not change.',
      bodyHtml: otpBlock(code, minutes),
      preheader: 'Your password reset code',
    }),
  },
  welcome: {
    label: 'Welcome / account verified',
    build: ({ name, storeUrl }) => ({
      subject: 'Welcome to DareDevil Gears',
      heading: `Welcome aboard${name ? ', ' + name.split(' ')[0] : ''}`,
      intro: 'Your email is verified and your account is ready. Track orders, save addresses and manage your wishlist from your account.',
      cta: { label: 'Shop the range', href: storeUrl },
    }),
  },
  order_confirmation: {
    label: 'Order confirmation',
    build: ({ order, orderUrl }) => ({
      subject: `Order ${order.orderNumber} confirmed`,
      heading: 'Thank you — your order is confirmed',
      intro:
        order.payment?.provider === 'cod'
          ? `Your cash-on-delivery order ${order.orderNumber} is confirmed. Please keep ${formatINR(order.pricing.grandTotal)} ready to pay the courier at delivery. We will email you again when it ships.`
          : `We have received your payment for order ${order.orderNumber}. We will email you again when it ships.`,
      bodyHtml: itemsTable(order) + addressBlock(order.shippingAddress),
      cta: { label: 'View order', href: orderUrl },
      preheader: `Order ${order.orderNumber} confirmed`,
    }),
  },
  payment_confirmation: {
    label: 'Payment received',
    build: ({ order, orderUrl }) => ({
      subject: `Payment received for ${order.orderNumber}`,
      heading: 'Payment received',
      intro: `We have received ${formatINR(order.pricing.grandTotal)} for order ${order.orderNumber}.`,
      cta: { label: 'View order', href: orderUrl },
    }),
  },
  payment_failed: {
    label: 'Payment failed',
    build: ({ order, retryUrl }) => ({
      subject: `Payment for ${order.orderNumber} did not go through`,
      heading: 'Your payment was not completed',
      intro: 'No money has been taken for this order (if your bank shows a debit, it is reversed automatically by your bank). You can try again from your cart.',
      cta: { label: 'Return to cart', href: retryUrl },
    }),
  },
  order_cancelled: {
    label: 'Order cancelled',
    build: ({ order, reason, refundAmount }) => ({
      subject: `Order ${order.orderNumber} cancelled`,
      heading: 'Your order has been cancelled',
      intro: `Order ${order.orderNumber} has been cancelled${reason ? ` (${reason})` : ''}.${refundAmount ? ` A refund of ${formatINR(refundAmount)} has been initiated to your original payment method.` : ''}`,
    }),
  },
  shipment_dispatched: {
    label: 'Shipment dispatched',
    build: ({ order, shipment, orderUrl }) => ({
      subject: `Order ${order.orderNumber} has shipped`,
      heading: 'Your order is on its way',
      intro: `Order ${order.orderNumber} has been dispatched${shipment.carrier ? ` with ${shipment.carrier}` : ''}.${shipment.trackingNumber ? ` Tracking number: ${shipment.trackingNumber}.` : ''}`,
      cta: shipment.trackingUrl ? { label: 'Track shipment', href: shipment.trackingUrl } : { label: 'View order', href: orderUrl },
    }),
  },
  shipment_update: {
    label: 'Shipment tracking update',
    build: ({ order, status, orderUrl }) => ({
      subject: `Update on order ${order.orderNumber}: ${ORDER_STATUS_LABEL[status] || status}`,
      heading: `Order status: ${ORDER_STATUS_LABEL[status] || status}`,
      intro: `There is an update on your order ${order.orderNumber}.`,
      cta: { label: 'View order', href: orderUrl },
    }),
  },
  order_delivered: {
    label: 'Delivery confirmation',
    build: ({ order, orderUrl }) => ({
      subject: `Order ${order.orderNumber} delivered`,
      heading: 'Delivered',
      intro: `Order ${order.orderNumber} has been delivered. If anything is damaged or wrong, tell us within 48 hours with photos and we will make it right. Once you have used your gear, we would value an honest review.`,
      cta: { label: 'Review your purchase', href: orderUrl },
    }),
  },
  return_received: {
    label: 'Return request received',
    build: ({ order, request }) => ({
      subject: `Return request ${request.requestNumber} received`,
      heading: 'We have received your return request',
      intro: `Your request ${request.requestNumber} for order ${order.orderNumber} is being reviewed. We will reply within 2 working days.`,
    }),
  },
  return_update: {
    label: 'Return request update',
    build: ({ order, request }) => ({
      subject: `Return ${request.requestNumber}: ${request.status.replace(/_/g, ' ')}`,
      heading: 'Update on your return',
      intro: `Your return request ${request.requestNumber} for order ${order.orderNumber} is now: ${request.status.replace(/_/g, ' ')}.${request.adminNotes ? ' Note: ' + request.adminNotes : ''}`,
    }),
  },
  refund_update: {
    label: 'Refund status update',
    build: ({ order, refund }) => ({
      subject: `Refund ${refund.status === 'processed' ? 'processed' : 'update'} for ${order.orderNumber}`,
      heading: refund.status === 'processed' ? 'Your refund has been processed' : refund.status === 'failed' ? 'We could not process your refund' : 'Refund initiated',
      intro:
        refund.status === 'processed'
          ? refund.mode === 'manual'
            ? `${formatINR(refund.amount)} has been refunded to your bank account / UPI${refund.manualReference ? ` (reference ${refund.manualReference})` : ''}.`
            : `${formatINR(refund.amount)} has been refunded to your original payment method. Banks usually take 5–7 working days to show it.`
          : refund.status === 'failed'
            ? 'Our team has been alerted and will contact you to complete the refund.'
            : `A refund of ${formatINR(refund.amount)} has been initiated for order ${order.orderNumber}.`,
    }),
  },
  grievance_ack: {
    label: 'Grievance acknowledgement',
    build: ({ ticket }) => ({
      subject: `Complaint ${ticket.ticketNumber} acknowledged`,
      heading: 'We have received your complaint',
      intro: `Your complaint has been registered as ${ticket.ticketNumber}. Our Grievance Officer will acknowledge it within 48 hours and aim to resolve it within 30 days.`,
    }),
  },
  admin_alert: {
    label: 'Admin notification',
    build: ({ title, lines = [], url }) => ({
      subject: `[DDG Admin] ${title}`,
      heading: title,
      bodyHtml: `<ul style="padding-left:18px;font-size:14px;line-height:1.7;color:#3A3D3B;">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
      cta: url ? { label: 'Open in admin', href: url } : undefined,
    }),
  },
};

function render(key, data, { override, business } = {}) {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Unknown email template: ${key}`);
  const built = tpl.build(data);
  const merged = {
    ...built,
    subject: override?.subject ? interpolate(override.subject, data) : built.subject,
    heading: override?.heading ? interpolate(override.heading, data) : built.heading,
    intro: override?.intro ? interpolate(override.intro, data) : built.intro,
    footerNote: override?.footerNote || 'You are receiving this email because of activity on your DareDevil Gears account or order.',
  };
  const html = layout({ ...merged, business });
  const text = [merged.heading, merged.intro, data.code ? `Code: ${data.code}` : '', merged.cta ? `${merged.cta.label}: ${merged.cta.href}` : '']
    .filter(Boolean)
    .join('\n\n');
  return { subject: merged.subject, html, text };
}

/** Very small {{var}} interpolation for admin-edited copy (no HTML allowed in overrides). */
function interpolate(str, data) {
  return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
    return v == null ? '' : String(v);
  });
}

module.exports = { TEMPLATES, render, layout };
