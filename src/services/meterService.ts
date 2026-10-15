import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { RecordUsageInput, RecordUsageResult } from "../domain/types.js";
import {
  IdempotencyKeyReusedError,
  InvalidQuantityError,
  InvalidTokenUsageError,
  TenantNotFoundError,
} from "../domain/error.js";
import {
  API_CALL_PRICE_MICROS,
  computeTokenCostMicros,
  totalBillableTokens,
  type TokenUsage,
} from "../domain/pricing.js";
import * as usageRepo from "../repositories/usageRepository.js";
import { assertWithinQuota } from "./quotaService.js";

interface ResolvedUsage {
  readonly quantity: number;
  readonly costMicros: bigint;
  readonly breakdown: TokenUsage | null;
}

function resolveUsage(input: RecordUsageInput): ResolvedUsage {
  if (input.type === "api_call") {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidQuantityError("quantity must be a positive integer");
    }
    return {
      quantity: input.quantity,
      costMicros: BigInt(input.quantity) * API_CALL_PRICE_MICROS,
      breakdown: null,
    };
  }
  const quantity = totalBillableTokens(input.tokens);
  if (quantity <= 0) throw new InvalidTokenUsageError("total tokens must be greater than 0");
  return {
    quantity,
    costMicros: computeTokenCostMicros(input.tokens),
    breakdown: input.tokens,
  };
}

function hashRequest(input: RecordUsageInput, u: ResolvedUsage): string {
  const payload: readonly unknown[] = u.breakdown
    ? [
        input.tenantId,
        input.type,
        u.quantity,
        u.breakdown.inputTokens,
        u.breakdown.cachedInputTokens,
        u.breakdown.outputTokens,
        u.breakdown.reasoningTokens,
      ]
    : [input.tenantId, input.type, u.quantity];
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class MeterService {
  constructor(private readonly pool: Pool) {}

  async record(input: RecordUsageInput): Promise<RecordUsageResult> {
    const usage = resolveUsage(input); // validate before taking a connection
    const requestHash = hashRequest(input, usage);

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const exists = await usageRepo.lockTenant(client, input.tenantId);
      if (!exists) throw new TenantNotFoundError(input.tenantId);

      const prior = await usageRepo.findByKey(client, input.tenantId, input.idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new IdempotencyKeyReusedError(input.idempotencyKey);
        }
        await client.query("COMMIT");
        return { ...(prior.responseSnapshot as RecordUsageResult), replayed: true };
      }

      await assertWithinQuota(client, {
        tenantId: input.tenantId,
        type: input.type,
        quantity: usage.quantity,
      });

      const eventId: string = randomUUID();
      const result: RecordUsageResult = {
        eventId,
        type: input.type,
        quantity: usage.quantity,
        costMicros: usage.costMicros.toString(),
        replayed: false,
      };

      await usageRepo.insertEvent(client, {
        id: eventId,
        tenantId: input.tenantId,
        type: input.type,
        quantity: usage.quantity,
        tokenBreakdown: usage.breakdown,
        costMicros: usage.costMicros,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        responseSnapshot: result,
      });

      await client.query("COMMIT");
      return result;
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}