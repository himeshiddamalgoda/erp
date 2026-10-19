"use client";
import { useQuery } from "@tanstack/react-query";
import { getQuotationOptions } from "../services/reference-data.service";
export const referenceKeys = {
  options: (base) => ["reference-data", base, "quotation-options"],
};
export function useQuotationOptions(baseURL, options = {}) {
  return useQuery({
    queryKey: referenceKeys.options(baseURL),
    queryFn: ({ signal }) => getQuotationOptions(baseURL, signal),
    staleTime: 60000,
    ...options,
  });
}
