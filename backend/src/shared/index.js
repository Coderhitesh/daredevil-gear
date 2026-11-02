'use strict';

/**
 * Shared constants for API, storefront and admin.
 * Money is always handled in integer paise on the server; helpers here only format.
 */

const BRAND = Object.freeze({
  displayName: 'DareDevil Gears',
  domain: 'daredevilgears.com',
});

const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  PAYMENT_FAILED: 'payment_failed',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return_requested',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  EXPIRED: 'expired',
});

const ORDER_STATUS_LABEL = Object.freeze({
  pending_payment: 'Awaiting payment',
  payment_failed: 'Payment failed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancellation_requested: 'Cancellation requested',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  returned: 'Returned',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  expired: 'Expired',
});

const PAYMENT_STATUS = Object.freeze({
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  COD_PENDING: 'cod_pending', // cash on delivery: collected by the courier at delivery
});

const PRODUCT_STATUS = Object.freeze({
  DRAFT: 'draft',
  REVIEW: 'review',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  CATALOG_MANAGER: 'catalog_manager',
  ORDER_MANAGER: 'order_manager',
  SUPPORT: 'support',
  CONTENT_EDITOR: 'content_editor',
});

const ADMIN_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CATALOG_MANAGER,
  ROLES.ORDER_MANAGER,
  ROLES.SUPPORT,
  ROLES.CONTENT_EDITOR,
]);

/** Permission matrix — enforced server-side. */
const PERMISSIONS = Object.freeze({
  'dashboard:read': ['super_admin', 'admin', 'catalog_manager', 'order_manager', 'support'],
  'products:read': ['super_admin', 'admin', 'catalog_manager', 'order_manager', 'support', 'content_editor'],
  'products:write': ['super_admin', 'admin', 'catalog_manager'],
  'products:publish': ['super_admin', 'admin', 'catalog_manager'],
  'products:import': ['super_admin', 'admin', 'catalog_manager'],
  'categories:write': ['super_admin', 'admin', 'catalog_manager'],
  'inventory:write': ['super_admin', 'admin', 'catalog_manager', 'order_manager'],
  'orders:read': ['super_admin', 'admin', 'order_manager', 'support'],
  'orders:write': ['super_admin', 'admin', 'order_manager'],
  'refunds:write': ['super_admin', 'admin', 'order_manager'],
  'customers:read': ['super_admin', 'admin', 'order_manager', 'support'],
  'customers:write': ['super_admin', 'admin', 'support'],
  'customers:export': ['super_admin', 'admin'],
  'coupons:write': ['super_admin', 'admin'],
  'reviews:moderate': ['super_admin', 'admin', 'support', 'content_editor'],
  'content:write': ['super_admin', 'admin', 'content_editor'],
  'settings:read': ['super_admin', 'admin'],
  'settings:write': ['super_admin', 'admin'],
  'shipping:write': ['super_admin', 'admin', 'order_manager'],
  'tax:write': ['super_admin', 'admin'],
  'grievances:read': ['super_admin', 'admin', 'support'],
  'grievances:write': ['super_admin', 'admin', 'support'],
  'reports:read': ['super_admin', 'admin', 'order_manager'],
  'audit:read': ['super_admin', 'admin'],
  'admins:manage': ['super_admin'],
});

function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  return Array.isArray(allowed) && allowed.includes(role);
}

/** Format integer paise as Indian Rupees. */
function formatINR(paise, { decimals } = {}) {
  const value = Number(paise || 0) / 100;
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  const digits = decimals ?? (hasFraction ? 2 : 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

module.exports = {
  BRAND,
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS,
  PRODUCT_STATUS,
  ROLES,
  ADMIN_ROLES,
  PERMISSIONS,
  can,
  formatINR,
};
