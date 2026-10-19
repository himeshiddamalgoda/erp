export function readTeamFilters(search) {
  const number = (key, fallback, max) => {
    const n = Number(search.get(key));
    return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
  };
  const id = (key) =>
    /^[0-9a-f-]{36}$/i.test(search.get(key) || "") ? search.get(key) : "";
  return {
    q: (search.get("q") || "").slice(0, 100),
    status: ["Active", "Archived", "All"].includes(search.get("status"))
      ? search.get("status")
      : "Active",
    managerId: id("managerId"),
    memberId: id("memberId"),
    page: number("page", 1, 1000000),
    pageSize: number("pageSize", 20, 100),
    sortBy: ["name", "code", "createdAt"].includes(search.get("sortBy"))
      ? search.get("sortBy")
      : "name",
    sortOrder: search.get("sortOrder") === "desc" ? "desc" : "asc",
  };
}
export const teamFilterSearch = (filters) =>
  new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined),
  ).toString();

export function cleanTeamParams(params) {
  const next = { ...params };
  if (typeof next.q === "string") next.q = next.q.trim().slice(0, 100);
  return Object.fromEntries(
    Object.entries(next).filter(([, v]) => v !== "" && v !== undefined),
  );
}
