"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAssignment, reassign } from "../services/assignment.service";
export function useAssignment(base, type, id) {
  return useQuery({
    queryKey: ["assignment", base, type, id],
    queryFn: ({ signal }) => getAssignment(base, type, id, signal),
    enabled: !!id,
    refetchOnMount: "always",
  });
}
export function useReassign(base) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body) => reassign(base, body),
    onSuccess: () =>
      Promise.all(
        [
          "assignment",
          "sales-teams",
          "customers",
          "quotations",
          "sales-orders",
          "reference-data",
        ].map((key) => client.invalidateQueries({ queryKey: [key, base] })),
      ),
  });
}
