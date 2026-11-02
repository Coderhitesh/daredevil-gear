'use strict';

/**
 * Draft CMS pages. Written for India, based on the "Daredevil Gears Website Fix Plan" (items 7–11 and the
 * Appendix draft return policy). Anything the business has not supplied is marked with
 * <span class="pending">…</span> and the page is flagged `requiresReview` so it shows in the admin.
 * Management/legal must review every page before launch.
 */

const P = (text) => `<span class="pending">[${text}]</span>`;

module.exports = [
  {
    slug: 'about-us',
    title: 'About DareDevil Gears',
    group: 'company',
    sortOrder: 1,
    requiresReview: true,
    reviewNotes: 'Company story, founding year and team details were not supplied. Describe only what the catalogue actually offers (fix plan item 13).',
    excerpt: 'Made-in-India tactical and adventure gear.',
    body: `<p>DareDevil Gears designs and sells tactical and adventure gear for trekkers, campers, riders and people who work outdoors — backpacks and load-carrying bags, camping equipment, torches and lighting, eyewear, field footwear and accessories.</p>
<p>We are based in Greater Noida, Uttar Pradesh. ${P('Add the company story, founding year and what makes the range different — management to supply')}</p>
<h2>What we stand for</h2>
<ul><li><strong>Honest product information.</strong> We describe what each product is and what it is not. No item in our training and tactical range provides ballistic protection unless a test certificate is shown on its page.</li>
<li><strong>Clear prices.</strong> Every price includes GST. Packaging and delivery charges are shown before you pay.</li>
<li><strong>Real reviews only.</strong> Reviews come from customers who received the product.</li></ul>
<h2>Bulk and institutional orders</h2>
<p>We welcome bulk orders from organisations and institutions. Use the <a href="/bulk-orders">bulk order form</a> and our team will respond within one working day.</p>`,
  },
  {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    group: 'help',
    sortOrder: 1,
    requiresReview: true,
    reviewNotes: 'Confirm dispatch times and courier partners.',
    body: `<h2>Are your prices inclusive of GST?</h2><p>Yes. Every price on the site is inclusive of all taxes. Packaging and delivery charges, where applicable, are shown on the product page, in your cart and at checkout before you pay — never added afterwards.</p>
<h2>How much is delivery?</h2><p>Delivery is free on orders above ₹5,000. Below that, the delivery charge for your PIN code is shown at checkout before payment. See our <a href="/pages/shipping-policy">Shipping Policy</a>.</p>
<h2>How long will my order take?</h2><p>Orders are dispatched within ${P('X')} working days. You will receive an email with the tracking number when your order ships.</p>
<h2>Do you ship outside India?</h2><p>International orders are handled on request — <a href="/contact">contact us</a> for a quote. Pepper spray and knives are delivered within India only.</p>
<h2>Can I cancel my order?</h2><p>Yes, free of charge before it is dispatched — from <a href="/account/orders">My Orders</a>. After dispatch, please use the return process.</p>
<h2>How do returns work?</h2><p>You can request a return within 7 days of delivery for unused items with original tags and packaging. Damaged or wrong items must be reported within 48 hours. See the <a href="/pages/return-refund-policy">Return &amp; Refund Policy</a>.</p>
<h2>Are your helmets or plate carriers bulletproof?</h2><p>No. Our airsoft/training helmets and plate carriers provide <strong>no ballistic protection</strong>. Plate carriers are supplied without plates.</p>
<h2>Which payment methods do you accept?</h2><p>UPI, credit and debit cards, net banking and wallets through Razorpay. We never see or store your card details.</p>
<h2>Who can buy pepper spray and knives?</h2><p>Only adults aged 18 or over, for delivery within India. You will be asked to confirm your age at checkout.</p>`,
  },
  {
    slug: 'shipping-policy',
    title: 'Shipping Policy',
    group: 'policy',
    sortOrder: 1,
    requiresReview: true,
    reviewNotes: 'Fix plan item 10: confirm the below-₹5,000 delivery charge, dispatch time, courier partners and the APO / India Post wording.',
    body: `<h2>Where we deliver</h2><p>We deliver across India. Enter your PIN code on any product page or at checkout to check delivery to your address.</p>
<h2>Delivery charges</h2><ul><li><strong>Free delivery</strong> on orders above ₹5,000 (after any coupon).</li><li>Below ₹5,000, the delivery charge depends on your PIN code and the weight of the order. It is shown in your cart and at checkout <strong>before you pay</strong>.</li><li>Delivery charges include GST.</li></ul>
<h2>Packaging charge</h2><p>Some products carry a packaging charge. It is shown on the product page and in your cart before you pay.</p>
<h2>Dispatch and delivery time</h2><p>Orders are dispatched within ${P('X')} working days of payment. Delivery usually takes ${P('X–Y')} working days after dispatch depending on location. We will email your tracking number when your order ships.</p>
<h2>APO / FPO addresses</h2><p>${P('Confirm the existing APO / India Post delivery arrangement and wording')}</p>
<h2>International orders</h2><p>International orders are handled on request — please <a href="/contact">contact us</a> for a quote. Some products, including pepper spray and knives, are not shipped outside India.</p>
<h2>Restricted products</h2><p>Pepper spray (an aerosol, classed as dangerous goods for transport) and knives are delivered within India only, to buyers aged 18 or over.</p>`,
  },
  {
    slug: 'return-refund-policy',
    title: 'Return & Refund Policy',
    group: 'policy',
    sortOrder: 2,
    requiresReview: true,
    reviewNotes: 'Based on the Appendix draft in the fix plan. Decide the pickup deduction (₹X) and confirm the grievance officer details.',
    body: `<h2>Return window</h2><p>You may request a return within <strong>7 days of delivery</strong>. Items must be unused, unwashed, with original tags and packaging, and the invoice.</p>
<h2>Damaged, defective or wrong item</h2><p>Tell us within <strong>48 hours of delivery</strong> — from <a href="/account/orders">My Orders</a>, at sales@daredevilgears.com or on WhatsApp +91 92209 41377 — with photos and the unboxing video. We will replace the item or refund in full, including shipping.</p>
<h2>Items that cannot be returned</h2><ul><li>Customised or personalised items</li><li>Footwear that has been worn outdoors</li><li>Opened lubricants and oils</li><li>Pepper spray</li><li>Items marked "non-returnable" on the product page</li></ul>
<h2>Return shipping</h2><p>For change-of-mind returns, the customer pays return shipping, or we arrange pickup and deduct ${P('₹X')} from the refund. For damaged or wrong items, we pay.</p>
<h2>Refunds</h2><p>Approved refunds are made to the original payment method within 7 working days of receiving the item. Your bank may take a few additional days to show the credit.</p>
<h2>Cancellation</h2><p>Orders can be cancelled free of charge before dispatch. After dispatch, follow the return process.</p>
<h2>Exchanges</h2><p>Size exchanges are free once per order, subject to stock.</p>
<h2>Contact</h2><p>Grievance Officer: see our <a href="/pages/grievance-redressal">Grievance Redressal</a> page. Complaints are acknowledged within 48 hours and resolved within 30 days.</p>`,
  },
  {
    slug: 'cancellation-policy',
    title: 'Cancellation Policy',
    group: 'policy',
    sortOrder: 3,
    requiresReview: true,
    body: `<p>You can cancel an order <strong>free of charge before it is dispatched</strong> from <a href="/account/orders">My Orders</a> (or with your order number and email if you checked out as a guest).</p>
<ul><li>If your order has not started processing, it is cancelled immediately and a full refund is initiated to your original payment method.</li><li>If we have started packing it, your request is sent to our team and confirmed by email.</li><li>Once dispatched, an order cannot be cancelled — please use the <a href="/pages/return-refund-policy">return process</a> after delivery.</li></ul>
<p>Refunds for cancelled orders are processed to the original payment method; banks typically take 5–7 working days to show the credit.</p>
<p>We may cancel an order if a product becomes unavailable, if delivery to the address is not possible, or if a restricted product cannot lawfully be supplied. You will receive a full refund in these cases.</p>`,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    group: 'policy',
    sortOrder: 4,
    requiresReview: true,
    reviewNotes: 'Fix plan item 11: align with the Digital Personal Data Protection Act 2023 — confirm retention periods and name the contact for data requests. Legal review required.',
    body: `<p>This policy explains how ${P('Legal entity name')} ("DareDevil Gears", "we") collects and uses your personal data when you use daredevilgears.com, in line with the Digital Personal Data Protection Act, 2023.</p>
<h2>What we collect and why</h2><ul><li><strong>Account and order details</strong> — name, email, phone and addresses — to process and deliver orders, send order updates and provide support.</li><li><strong>Payment information</strong> — payments are processed by Razorpay. We receive the payment status and reference, never your full card number or CVV.</li><li><strong>Technical data</strong> — IP address and browser details, for security and fraud prevention.</li><li><strong>Marketing</strong> — only if you opt in. You can withdraw consent at any time.</li></ul>
<h2>Who we share it with</h2><p>Only with service providers needed to run the store: payment gateway (Razorpay), courier partners, email delivery and hosting providers — and where required by law.</p>
<h2>How long we keep it</h2><p>Order and invoice records are kept for the period required by tax law ${P('confirm, e.g. 8 years')}. Account data is kept while your account is active and for ${P('X months')} afterwards.</p>
<h2>Your rights</h2><p>You can access, correct or erase your data, withdraw consent and download your data from <a href="/account/privacy">Account → Privacy</a>, or by writing to our data contact below. We respond within 30 days.</p>
<h2>Data protection contact</h2><p>${P('Name, designation and email of the person handling data requests')}</p>
<h2>Cookies</h2><p>We use essential cookies to keep you signed in, remember your cart and protect against fraud. Analytics are used only to understand how the site is used.</p>`,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    group: 'policy',
    sortOrder: 5,
    requiresReview: true,
    reviewNotes: 'Fix plan item 11: add company identity, order acceptance rules and product-safety disclaimers; governing law India, courts at Gautam Buddh Nagar. Legal review required.',
    body: `<h2>Who we are</h2><p>daredevilgears.com is operated by ${P('Legal entity name, CIN, registered office address')}, GSTIN ${P('confirm GSTIN')}.</p>
<h2>Orders</h2><p>Placing an order is an offer to buy. A contract is formed when we confirm your payment. We may decline or cancel an order (with a full refund) if a product is unavailable, priced incorrectly due to an obvious error, cannot be delivered to your address, or cannot lawfully be supplied to you.</p>
<h2>Prices</h2><p>All prices are in Indian Rupees and inclusive of GST. Packaging and delivery charges are shown before payment.</p>
<h2>Age-restricted products</h2><p>Pepper spray and knives are sold only to adults aged 18 or over and are delivered within India only. You must use them lawfully.</p>
<h2>Product safety</h2><p>Our airsoft/training helmets, plate carriers and eyewear are <strong>not</strong> ballistic or life-saving protective equipment unless a test certificate is displayed on the product page. Plate carriers are supplied without plates. Read the safety information on each product page before use.</p>
<h2>Returns and refunds</h2><p>See our <a href="/pages/return-refund-policy">Return &amp; Refund Policy</a> and <a href="/pages/cancellation-policy">Cancellation Policy</a>.</p>
<h2>Reviews</h2><p>Reviews must be genuine and based on your own use of the product. We moderate reviews and may remove content that is abusive, unrelated or misleading.</p>
<h2>Governing law</h2><p>These terms are governed by the laws of India. The courts at Gautam Buddh Nagar, Uttar Pradesh have jurisdiction.</p>
<h2>Grievances</h2><p>See <a href="/pages/grievance-redressal">Grievance Redressal</a>.</p>`,
  },
  {
    slug: 'grievance-redressal',
    title: 'Grievance Redressal',
    group: 'policy',
    sortOrder: 6,
    requiresReview: true,
    reviewNotes: 'Officer name, designation, phone and email are mandatory (Consumer Protection (E-Commerce) Rules 2020). Fill them in Admin → Settings → Grievance officer.',
    body: `<p>In accordance with the Consumer Protection (E-Commerce) Rules, 2020, you can contact our Grievance Officer with any complaint about an order, payment, product or delivery. The officer's details are shown below.</p>
<ul><li>Complaints are <strong>acknowledged within 48 hours</strong>.</li><li>Complaints are <strong>resolved within one month</strong> of receipt.</li></ul>
<p>You can lodge a complaint using the form on this page and track it with your ticket number.</p>`,
  },
  {
    slug: 'product-safety',
    title: 'Product Safety & Usage',
    group: 'help',
    sortOrder: 2,
    requiresReview: true,
    body: `<h2>Protective claims</h2><p>No product in our training and tactical range is bulletproof or provides ballistic, fragmentation or life-saving protection unless a test certificate is displayed on its product page. Airsoft/training helmets are for airsoft, paintball, training and adventure riding only. Plate carriers are supplied <strong>without plates</strong>.</p>
<h2>Eyewear</h2><p>Lens and frame descriptions refer to impact resistance for outdoor and sporting use. A safety standard (such as ANSI Z87.1) is stated only where the supplier's test report is on file.</p>
<h2>Pepper spray</h2><p>For lawful self-defence only, by adults. Keep away from children, heat and direct sunlight. Do not carry on aircraft.</p>
<h2>Knives and multitools</h2><p>Sold to adults only. Fold and store safely; carry in accordance with local law.</p>
<h2>Stoves, fuel and lanterns</h2><p>Use outdoors in a ventilated area, away from tents and flammable material. Never leave lit stoves unattended.</p>
<h2>Engine oils and coolants</h2><p>Keep out of reach of children. Avoid contact with skin and eyes. Dispose of used oil responsibly.</p>`,
  },
  {
    slug: 'warranty',
    title: 'Warranty Information',
    group: 'help',
    sortOrder: 3,
    isPublished: false,
    requiresReview: true,
    reviewNotes: 'No warranty terms were supplied. Publish only after management defines warranty coverage per product line.',
    body: `<p>${P('Define warranty coverage, duration and claim process per product line before publishing this page')}</p>`,
  },
  {
    slug: 'payment-information',
    title: 'Payment Information',
    group: 'help',
    sortOrder: 4,
    requiresReview: false,
    body: `<p>Payments on daredevilgears.com are processed securely by <strong>Razorpay</strong>. You can pay with UPI, credit or debit cards, net banking and supported wallets.</p>
<ul><li>All prices are in Indian Rupees and include GST.</li><li>Your card details are entered on Razorpay's secure checkout — we never see or store your card number or CVV.</li><li>Your order is confirmed only after the payment is verified. If money is debited but the order is not confirmed, it is either confirmed automatically within a few minutes or refunded by your bank.</li><li>A GST tax invoice is available in My Orders once payment is confirmed.</li></ul>
<p>Cash on delivery is currently not available.</p>`,
  },
];
