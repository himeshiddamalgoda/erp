"use client";
import { cleanTeamParams } from "@/utils/sales-team";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import * as api from "../services/sales-team.service";
export function useSalesTeams(base, filters, enabled = true) {
  const params = cleanTeamParams(filters);
  return useQuery({
    queryKey: ["sales-teams", base, "list", params],
    queryFn: ({ signal }) => api.listTeams(base, params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useSalesTeam(base, id) {
  return useQuery({
    queryKey: ["sales-teams", base, "detail", id],
    queryFn: ({ signal }) => api.getTeam(base, id, signal),
    enabled: !!id,
    refetchOnMount: "always",
  });
}
export function useTeamMutations(base) {
  const client = useQueryClient();
  const invalidate = () =>
    Promise.all(
      ["sales-teams", "reference-data"].map((key) =>
        client.invalidateQueries({ queryKey: [key, base] }),
      ),
    );
  return {
    create: useMutation({
      mutationFn: (input) => api.createTeam(base, input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input) => api.updateTeam(base, input),
      onSuccess: invalidate,
    }),
    lifecycle: useMutation({
      mutationFn: (input) => api.teamLifecycle(base, input),
      onSuccess: invalidate,
    }),
  };
}
