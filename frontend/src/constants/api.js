const origin = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");
const base = /\/api\/v1$/.test(origin) ? origin : `${origin}/api/v1`;
export const API = {
  sales: base,
  demoWorkspaces:
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES === "true",
  timeout: 20000,
};
export const getApiBaseUrl = () => base;
