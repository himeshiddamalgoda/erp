"use client";
import { useSyncExternalStore } from "react";
import {
  readOrderAttempt,
  subscribeOrderAttempts,
} from "@/utils/order-attempt";
const noop = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
export function useOrderAttempt(scope, operation) {
  return useSyncExternalStore(
    subscribeOrderAttempts,
    () => readOrderAttempt(scope, operation),
    () => null,
  );
}
