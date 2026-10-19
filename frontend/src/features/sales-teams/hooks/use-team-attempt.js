"use client";
import { useSyncExternalStore } from "react";
import {
  readOrderAttempt,
  subscribeOrderAttempts,
} from "@/utils/order-attempt";
const noop = () => () => {};
export const teamAttemptScope = (base, actor) =>
  `thread:sales-team-attempt:v1:${base}:${actor}`;
export function useTeamAttempt(scope) {
  return useSyncExternalStore(
    subscribeOrderAttempts,
    () => readOrderAttempt(scope, "create"),
    () => null,
  );
}
export function useTeamHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
