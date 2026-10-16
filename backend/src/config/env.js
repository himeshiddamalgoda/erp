import "dotenv/config";
export const env = {
  timezone: process.env.COMPANY_TIMEZONE || "Asia/Colombo",
  sellerName: process.env.COMPANY_NAME || "Garment ERP",
  developmentAuth: process.env.DEV_AUTH_ENABLED === "true",
  developmentActor: process.env.DEV_ACTOR || "sales",
};
new Intl.DateTimeFormat("en-CA", { timeZone: env.timezone }).format();
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function assertAuthConfiguration() {
  if (env.developmentAuth && process.env.NODE_ENV === "production")
    throw new Error("Development authentication is forbidden in production");
}
