import { Router, type Request, type Response, type NextFunction } from "express";
import type { BillingService } from "../../services/billingService.js";
import { TenantHeaderSchema } from "../schema.js";

export function billingRoutes(billing: BillingService): Router {
  const router = Router();
  router.post("/billing/checkout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = TenantHeaderSchema.parse(req.header("X-Tenant-Id"));
      res.status(200).json(await billing.createProCheckout(tenantId));
    } catch (err: unknown) {
      next(err);
    }
  });
  return router;
}