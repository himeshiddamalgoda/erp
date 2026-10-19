"use client";
import { cleanTeamParams } from "@/utils/sales-team";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { listStaff } from "../services/staff.service";
export function useStaff(base, filters, enabled) {
  const params = cleanTeamParams(filters);
  return useQuery({
    queryKey: ["users", base, params],
    queryFn: ({ signal }) => listStaff(base, params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}
