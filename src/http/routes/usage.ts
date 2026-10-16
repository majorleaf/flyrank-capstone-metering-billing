import { Router, type Request, type Response, type NextFunction } from "express";
import type { UsageService } from "../../services/usageService.js";
import { TenantHeaderSchema } from "../schema.js";

export function usageRoutes(usage: UsageService): Router {
    const router = Router();
    router.get("/usage", async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = TenantHeaderSchema.parse(req.header("X-Tenant-Id"));
        res.json(await usage.getReport(tenantId));
      } catch (err: unknown) {
        next(err);
      }
    });
    return router;
}