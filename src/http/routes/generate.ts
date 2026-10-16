import { Router, type Request, type Response, type NextFunction } from "express";
import type { MeterService } from "../../services/meterService.js";
import type { RecordUsageInput } from "../../domain/types.js";
import { GenerateBodySchema, IdempotencyKeySchema, TenantHeaderSchema } from "../schema.js";

export function generateRoutes(meter: MeterService): Router {
    const router = Router();
     router.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = TenantHeaderSchema.parse(req.header("X-Tenant-Id"));
      const idempotencyKey = IdempotencyKeySchema.parse(req.header("Idempotency-Key"));
      const body = GenerateBodySchema.parse(req.body);

      const input: RecordUsageInput =
        body.type === "api_call"
          ? { tenantId, idempotencyKey, type: "api_call", quantity: body.quantity }
          : { tenantId, idempotencyKey, type: "ai_tokens", tokens: body.tokens };

      res.status(200).json(await meter.record(input));
    } catch (err: unknown) {
      next(err);
    }
  });
  return router;
}