const origin = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");
const baseUrl = (url) => (/\/api\/v1$/.test(url) ? url : `${url}/api/v1`);
export const API = {
  sales: baseUrl(origin),
  manager: process.env.NEXT_PUBLIC_MANAGER_API_URL
    ? baseUrl(process.env.NEXT_PUBLIC_MANAGER_API_URL.replace(/\/+$/, ""))
    : "",
  demoWorkspaces:
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES === "true",
  timeout: 20000,
};
export const getApiBaseUrl = (workspace) =>
  workspace === "manager" && API.demoWorkspaces && API.manager
    ? API.manager
    : API.sales;
