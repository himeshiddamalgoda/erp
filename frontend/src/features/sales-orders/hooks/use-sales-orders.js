"use client";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import * as api from "../services/sales-order.service";
export const orderKeys = {
  all: (base) => ["sales-orders", base],
  lists: (base) => ["sales-orders", base, "list"],
  detail: (base, id) => ["sales-orders", base, "detail", id],
  list: (base, params) => ["sales-orders", base, "list", params],
  history: (base, id, kind, params) => ["sales-orders", base, kind, id, params],
};
export function useSalesOrders(base, filters, options = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined),
  );
  return useQuery({
    queryKey: orderKeys.list(base, params),
    queryFn: ({ signal }) => api.listSalesOrders(base, params, signal),
    placeholderData: keepPreviousData,
    ...options,
    staleTime: 0,
  });
}
export function useSalesOrder(base, id) {
  return useQuery({
    queryKey: orderKeys.detail(base, id),
    queryFn: ({ signal }) => api.getSalesOrder(base, id, signal),
    enabled: !!id,
    refetchOnMount: "always",
  });
}
export function useOrderHistory(base, id, kind, params, enabled) {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== "" && value !== undefined,
    ),
  );
  return useQuery({
    queryKey: orderKeys.history(base, id, kind, queryParams),
    queryFn: ({ signal }) =>
      kind === "revisions"
        ? api.getOrderRevisions(base, id, queryParams, signal)
        : api.getOrderActivity(base, id, queryParams, signal),
    enabled: !!id && enabled,
    staleTime: 0,
  });
}
export function useOrderFulfilment(base, id, enabled) {
  return useQuery({
    queryKey: orderKeys.history(base, id, "fulfilment", {}),
    queryFn: ({ signal }) => api.getOrderFulfilment(base, id, signal),
    enabled: !!id && enabled,
    staleTime: 0,
  });
}
export function useSalesOrderMutations(base) {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({
      queryKey: orderKeys.all(base),
      refetchType: "none",
    });
  return {
    create: useMutation({
      mutationFn: (input) => api.createSalesOrder(base, input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input) => api.updateSalesOrder(base, input),
      onSuccess: invalidate,
    }),
    action: useMutation({
      mutationFn: (input) => api.salesOrderAction(base, input),
      onSuccess: () =>
        client.invalidateQueries({ queryKey: orderKeys.all(base) }),
    }),
    remove: useMutation({
      mutationFn: (input) => api.deleteSalesOrder(base, input),
      onSuccess: invalidate,
    }),
    pdf: useMutation({ mutationFn: (input) => api.getOrderPdf(base, input) }),
  };
}
