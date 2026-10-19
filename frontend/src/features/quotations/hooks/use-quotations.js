"use client";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import * as service from "../services/quotation.service";
export const quotationKeys = {
  all: (base) => ["quotations", base],
  lists: (base) => ["quotations", base, "list"],
  list: (base, filters) => ["quotations", base, "list", filters],
  detail: (base, id) => ["quotations", base, "detail", id],
};
export function useQuotations(base, filters, options = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined),
  );
  return useQuery({
    queryKey: quotationKeys.list(base, params),
    staleTime: 0,
    queryFn: ({ signal }) => service.listQuotations(base, params, signal),
    placeholderData: keepPreviousData,
    ...options,
  });
}
export function useQuotation(base, id, options = {}) {
  return useQuery({
    queryKey: quotationKeys.detail(base, id),
    queryFn: ({ signal }) => service.getQuotation(base, id, signal),
    enabled: Boolean(id),
    refetchOnMount: "always",
    ...options,
  });
}
export function useQuotationMutations(base) {
  const client = useQueryClient();
  const updateCache = async (quotation) => {
    if (quotation?.familyId)
      client.setQueryData(quotationKeys.detail(base, quotation.id), quotation);
    await client.invalidateQueries({
      queryKey: quotationKeys.all(base),
      refetchType: "none",
    });
  };
  const create = useMutation({
    mutationFn: (body) => service.createQuotation(base, body),
    onSuccess: updateCache,
  });
  const update = useMutation({
    mutationFn: (input) => service.updateQuotation(base, input),
    onSuccess: updateCache,
  });
  const action = useMutation({
    mutationFn: (input) => service.quotationAction(base, input),
    onSuccess: async (data, input) => {
      if (input.action === "convert") {
        await client.invalidateQueries({ queryKey: quotationKeys.all(base) });
      } else {
        await updateCache(data);
        await client.invalidateQueries({
          queryKey: quotationKeys.detail(base, input.id),
        });
      }
    },
  });
  const remove = useMutation({
    mutationFn: (input) => service.deleteQuotation(base, input),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: quotationKeys.all(base),
        refetchType: "none",
      });
      await client.invalidateQueries({ queryKey: quotationKeys.lists(base) });
    },
  });
  const pdf = useMutation({
    mutationFn: (id) => service.getQuotationPdf(base, id),
  });
  return { create, update, action, remove, pdf };
}
