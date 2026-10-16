import axios from "axios";
import { API } from "@/constants/api";
import { toApiError } from "@/utils/api-error";
const clients = new Map();
export function getHttpClient(baseURL) {
  if (!clients.has(baseURL)) {
    const client = axios.create({
      baseURL,
      timeout: API.timeout,
      headers: { Accept: "application/json" },
    });
    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (
          typeof Blob !== "undefined" &&
          error.response?.data instanceof Blob
        ) {
          try {
            error.response.data = JSON.parse(await error.response.data.text());
          } catch {}
        }
        return Promise.reject(toApiError(error));
      },
    );
    clients.set(baseURL, client);
  }
  return clients.get(baseURL);
}
