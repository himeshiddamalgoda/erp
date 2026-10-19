export const CUSTOMER_FILTERS = {
  q: "",
  status: "Active",
  salesTeamId: "",
  ownerId: "",
  country: "",
  currency: "",
  page: 1,
  pageSize: 20,
  sortBy: "name",
  sortOrder: "asc",
};
export const CUSTOMER_SCALARS = [
  "name",
  "displayName",
  "country",
  "currency",
  "paymentTerms",
  "salesTeamId",
  "ownerId",
  "email",
  "phone",
  "website",
  "registrationNumber",
  "internalNotes",
];
export const CONTACT_FIELDS = [
  "name",
  "jobTitle",
  "email",
  "phone",
  "primary",
  "isActive",
];
export const ADDRESS_FIELDS = [
  "addressType",
  "label",
  "line1",
  "line2",
  "city",
  "region",
  "postalCode",
  "country",
  "isDefault",
  "isActive",
];
export const canManageCustomers = (actor) =>
  actor?.role === "Admin" || actor?.capabilities?.includes("customers:write");
export const canAssignCustomers = (actor) =>
  actor?.role === "Admin" || actor?.capabilities?.includes("customers:assign");
