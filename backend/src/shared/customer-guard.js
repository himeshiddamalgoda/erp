import { invalid } from "./errors.js";
// Document writers take SHARE here after their existing family/order lock.
// Customer mutations take UPDATE; their blocker reads never lock documents.
export async function customerGuard(
  repository,
  id,
  transaction,
  { requireActive = true } = {},
) {
  if (!transaction)
    throw new Error("Customer guard requires a write transaction");
  const customer = await repository.findById("customers", id, {
    transaction,
    lock: transaction.LOCK.SHARE,
  });
  if (!customer || (requireActive && !customer.isActive))
    invalid("customerId", "Select an active buyer");
  return customer;
}
