export const pick = (o, keys) =>
  Object.fromEntries(
    keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]),
  );
export const scalarKeys = [
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
export const contactKeys = [
  "name",
  "jobTitle",
  "email",
  "phone",
  "isPrimary",
  "isActive",
];
export const addressKeys = [
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
export const status = (c) => (c.isActive ? "Active" : "Archived");
export function contact(c) {
  return {
    ...pick(c, [
      "id",
      "name",
      "jobTitle",
      "email",
      "phone",
      "isActive",
      "createdAt",
      "updatedAt",
    ]),
    primary: Boolean(c.isPrimary),
  };
}
export const address = (a) =>
  pick(a, ["id", ...addressKeys, "createdAt", "updatedAt"]);
export function summary(c, team, owner) {
  return {
    ...pick(c, [
      "id",
      "code",
      "name",
      "displayName",
      "country",
      "currency",
      "version",
    ]),
    status: status(c),
    salesTeam: pick(team, ["id", "name"]),
    owner: pick(owner, ["id", "displayName"]),
  };
}
export const normalizeContact = (c) => {
  const { primary, ...rest } = c;
  return { ...rest, ...(primary !== undefined ? { isPrimary: primary } : {}) };
};
