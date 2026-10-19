import { readDevelopmentWorkspace } from "../modules/development-session/development-session.js";
import { env, assertAuthConfiguration } from "../config/env.js";
import { AppError } from "../shared/errors.js";
export const demoIds = {
  sales: "10000000-0000-4000-8000-000000000001",
  manager: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-000000000003",
  viewer: "10000000-0000-4000-8000-000000000004",
  team: "20000000-0000-4000-8000-000000000001",
  customer: "30000000-0000-4000-8000-000000000001",
  billing: "40000000-0000-4000-8000-000000000001",
  shipping: "40000000-0000-4000-8000-000000000002",
  style: "50000000-0000-4000-8000-000000000001",
  contact: "60000000-0000-4000-8000-000000000001",
};
const validId = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function authContext(req, _res, next) {
  assertAuthConfiguration();
  // Trusted authentication wins. Signed local demo sessions are development-only.
  if (!req.user && env.developmentAuth) {
    const workspace = readDevelopmentWorkspace(req) || env.developmentActor;
    const role = {
      sales: "Sales",
      manager: "SalesManager",
      admin: "Admin",
      viewer: "Viewer",
    }[workspace];
    if (!role)
      return next(
        new AppError(
          401,
          "INVALID_PRINCIPAL",
          "Unknown fixed development principal",
        ),
      );
    req.user = {
      id: demoIds[workspace],
      role,
      salesTeamIds: [demoIds.team],
    };
  }
  if (
    !req.user ||
    !validId(req.user.id) ||
    !["Sales", "SalesManager", "Admin", "Viewer"].includes(req.user.role) ||
    !Array.isArray(req.user.salesTeamIds) ||
    !req.user.salesTeamIds.every((id) => validId(id))
  )
    return next(
      new AppError(
        401,
        "UNAUTHENTICATED",
        "A valid trusted principal is required",
      ),
    );
  next();
}
