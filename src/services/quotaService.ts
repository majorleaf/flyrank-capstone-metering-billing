import type { PoolClient } from "pg";
import type { UsageType } from "../domain/types.js";
import {
    PaymentRequiredError,
    QuotaExceededError,
    TenantNotFoundError,
} from "../domain/error.js";
import { utcMonthBounds } from "../domain/period.js";
import * as usageRepo from "../repositories/usageRepository.js";

export async function assertWithinQuota(
    client: PoolClient,
    req: { tenantId: string; type: UsageType; quantity: number },
    now: Date = new Date(),
): Promise<void> {
    const plan = await usageRepo.getTenantPlan(client, req.tenantId);
    if (!plan) throw new TenantNotFoundError(req.tenantId);
    if (plan.status !== "active") throw new PaymentRequiredError(plan.status);

    const limit = req.type === "api_call" ? plan.apiCallsLimit : plan.aiTokensLimit;
    const { start, end } = utcMonthBounds(now);
    const used = await usageRepo.sumUsage(client, req.tenantId, req.type, start, end);

  if (used + req.quantity > limit) {
    throw new QuotaExceededError({
      type: req.type,
      used,
      limit,
      requested: req.quantity,
      retryAfterSeconds: Math.ceil((end.getTime() - now.getTime()) / 1000),
    });
  }
}
