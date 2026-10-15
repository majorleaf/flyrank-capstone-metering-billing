import type { Pool, PoolClient } from "pg";
import { TenantNotFoundError } from "../domain/error.js";
import { utcMonthBounds } from "../domain/period.js";
import *as  usageRepo from "../repositories/usageRepository.js";

interface UsageLine {
    readonly used: number;
    readonly limit: number;
    readonly costMicros: string;
}

export interface UsageReport {
    readonly tenantId: string;
    readonly status: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly apiCalls: UsageLine;
    readonly aiTokens: UsageLine;
    readonly totalCostMicros: string;
}

export class UsageService {
    constructor(private readonly pool: Pool) {}

    async getReport(tenantId: string, now: Date = new Date()): Promise<UsageReport> {
         const client: PoolClient = await this.pool.connect();
    try {
      const plan = await usageRepo.getTenantPlan(client, tenantId);
      if (!plan) throw new TenantNotFoundError(tenantId);

      const { start, end } = utcMonthBounds(now);
      const totals = await usageRepo.sumUsageByType(client, tenantId, start, end);

      return {
        tenantId,
        status: plan.status,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        apiCalls: {
          used: totals.api_call.used,
          limit: plan.apiCallsLimit,
          costMicros: totals.api_call.costMicros.toString(),
        },
        aiTokens: {
          used: totals.ai_tokens.used,
          limit: plan.aiTokensLimit,
          costMicros: totals.ai_tokens.costMicros.toString(),
        },
        totalCostMicros: (totals.api_call.costMicros + totals.ai_tokens.costMicros).toString(),
      };
    } finally {
      client.release();
    }
  }
}