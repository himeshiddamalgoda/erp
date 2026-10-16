export class ApiError extends Error {
  constructor({
    status = 0,
    code = "NETWORK_ERROR",
    message = "Could not connect to the API. Check the connection and try again.",
    fields = {},
    requestId,
  }) {
    super(message);
    Object.assign(this, { name: "ApiError", status, code, fields, requestId });
  }
}
export function toApiError(error) {
  if (error instanceof ApiError) return error;
  const payload = error.response?.data?.error;
  return new ApiError({
    status: error.response?.status || 0,
    code:
      payload?.code ||
      (error.code === "ECONNABORTED" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR"),
    message: typeof payload === "string" ? payload : payload?.message,
    fields: payload?.fields || {},
    requestId: payload?.requestId || error.response?.headers?.["x-request-id"],
  });
}
export const formFieldPath = (path) => path.replace(/\[(\d+)\]/g, ".$1");
export function applyServerErrors(error, setError) {
  for (const [path, message] of Object.entries(error.fields || {})) {
    if (path && path !== "body")
      setError(formFieldPath(path), { type: "server", message });
  }
}
