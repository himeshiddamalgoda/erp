import Decimal from "decimal.js";
export const statusLabel = (status) =>
  status === "PendingApproval" ? "Pending approval" : status;
export function formatMoney(value, currency = "USD") {
  // BigInt keeps whole-money formatting exact even near DECIMAL(18,2)'s limit.
  try {
    const fixed = new Decimal(value || 0).toFixed(2);
    const [whole, cents] = fixed.split(".");
    const integer = new Intl.NumberFormat("en-US").format(BigInt(whole));
    return `${currency} ${integer}.${cents}`;
  } catch {
    return `${currency} —`;
  }
}
export const formatQuantity = (value) =>
  new Intl.NumberFormat("en-US").format(value || 0);
export function formatDate(value, options = {}) {
  if (!value) return "Not set";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : {}),
    ...options,
  }).format(date);
}
export const initials = (name) =>
  (name || "Workspace")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
export function lineTotal(qty, price) {
  try {
    return new Decimal(price || 0).times(qty || 0).toFixed(2);
  } catch {
    return "0.00";
  }
}
export function quotationTotals(lines = []) {
  return lines.reduce(
    (total, line) => ({
      qty: total.qty + (Number(line.qty) || 0),
      amount: new Decimal(total.amount)
        .plus(lineTotal(line.qty, line.unitPrice))
        .toFixed(2),
    }),
    { qty: 0, amount: "0.00" },
  );
}
export const addressLabel = (address) =>
  address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.postalCode,
        address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "Not selected";
