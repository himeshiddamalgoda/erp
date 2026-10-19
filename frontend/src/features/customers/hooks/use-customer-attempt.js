"use client";
import { useSyncExternalStore } from "react";
import {
  readOrderAttempt,
  subscribeOrderAttempts,
} from "@/utils/order-attempt";
const noop = () => () => {};
export const customerAttemptScope = (base, actor) =>
  `thread:customer-attempt:v1:${base}:${actor}`;
export function useCustomerAttempt(scope) {
  return useSyncExternalStore(
    subscribeOrderAttempts,
    () => readOrderAttempt(scope, "create"),
    () => null,
  );
}
export function useCustomerHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
