import {
  DEFAULT_FILTERS,
  QUOTATION_STATUSES,
  PAGE_SIZES,
} from "@/constants/quotations";
const positive = (value, fallback) =>
  Number.isInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;
export function readListFilters(search) {
  return {
    ...DEFAULT_FILTERS,
    ...Object.fromEntries(
      ["q", "customerId", "salesTeamId", "ownerId", "fromDate", "toDate"].map(
        (key) => [key, search.get(key) || ""],
      ),
    ),
    status: QUOTATION_STATUSES.includes(search.get("status"))
      ? search.get("status")
      : "",
    page: Math.min(positive(search.get("page"), 1), 1000000),
    pageSize: PAGE_SIZES.includes(Number(search.get("pageSize")))
      ? Number(search.get("pageSize"))
      : 20,
    sortBy: [
      "createdAt",
      "quotationDate",
      "quoteNumber",
      "total",
      "updatedAt",
    ].includes(search.get("sortBy"))
      ? search.get("sortBy")
      : "createdAt",
    sortOrder: search.get("sortOrder") === "asc" ? "asc" : "desc",
    includeRevisions: search.get("includeRevisions") === "true",
  };
}
export function filtersToSearch(filters) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== "" && value !== DEFAULT_FILTERS[key])
      result.set(key, String(value));
  return result.toString();
}
