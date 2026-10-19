import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import { businessDate, env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { loadQuotationOptions } from "./reference-data.repository.js";

export function referenceDataRoutes(context) {
  const router = Router();
  router.use(authContext);
  router.get("/quotation-options", async (req, res) => {
    const { user, resolvedSalesTeamIds, ...options } =
      await loadQuotationOptions(context, req.user);
    if (!user?.isActive)
      throw new AppError(
        401,
        "INVALID_PRINCIPAL",
        "An active principal is required",
      );
    res.set("Cache-Control", "private, no-store").json({
      data: {
        actor: {
          id: user.id,
          displayName: user.displayName,
          role: req.user.role,
          salesTeamIds: resolvedSalesTeamIds,
          capabilities: Array.isArray(req.user.capabilities)
            ? req.user.capabilities.filter((c) =>
                [
                  "customers:write",
                  "customers:assign",
                  "sales-teams:write",
                  "assignments:write",
                ].includes(c),
              )
            : [],
        },
        company: {
          timezone: env.timezone,
          businessDate: businessDate(),
          currencies: ["USD", "LKR", "GBP", "EUR"],
          countries: env.countries,
        },
        ...options,
      },
    });
  });
  return router;
}
