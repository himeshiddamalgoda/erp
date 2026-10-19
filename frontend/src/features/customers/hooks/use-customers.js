"use client";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import * as api from "../services/customer.service";
export const customerKeys = {
  all: (base) => ["customers", base],
  list: (base, params) => ["customers", base, "list", params],
  detail: (base, id, inactive = false) => [
    "customers",
    base,
    "detail",
    id,
    inactive,
  ],
};
export function useCustomers(base, filters, options = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined),
  );
  return useQuery({
    queryKey: customerKeys.list(base, params),
    queryFn: ({ signal }) => api.listCustomers(base, params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    ...options,
  });
}
export function useCustomer(base, id, inactive = false) {
  return useQuery({
    queryKey: customerKeys.detail(base, id, inactive),
    queryFn: ({ signal }) => api.getCustomer(base, id, inactive, signal),
    enabled: !!id,
    refetchOnMount: "always",
  });
}
export function useCustomerMutations(base) {
  const client = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({
        queryKey: customerKeys.all(base),
        refetchType: "none",
      }),
      client.invalidateQueries({
        queryKey: ["reference-data"],
        refetchType: "none",
      }),
    ]);
  };
  return {
    create: useMutation({
      mutationFn: (input) => api.createCustomer(base, input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input) => api.updateCustomer(base, input),
      onSuccess: invalidate,
    }),
    lifecycle: useMutation({
      mutationFn: (input) => api.customerLifecycle(base, input),
      onSuccess: invalidate,
    }),
  };
}
