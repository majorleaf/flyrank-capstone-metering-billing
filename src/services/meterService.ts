// src/services/meterService.ts
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { RecordUsageInput, RecordUsageResult } from "../domain/types.js";
import { IdempotencyKeyReusedError, TenantNotFoundError } from "../domain/error.js";
import * as usageRepo from "../repositories/usageRepository.js";
import { assertWithinQuota } from "./quotaService.js";

function hashRequest(input: RecordUsageInput): string {
  return createHash("sha256")
    .update(JSON.stringify([input.tenantId, input.type, input.quantity]))
    .digest("hex");
}

export class MeterService {
  constructor(private readonly pool: Pool) {}

  async record(input: RecordUsageInput): Promise<RecordUsageResult> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const exists = await usageRepo.lockTenant(client, input.tenantId);
      if (!exists) throw new TenantNotFoundError(input.tenantId);

      const requestHash = hashRequest(input);
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
        quantity: input.quantity,
      });

      // Step 5: quota check goes here
      const eventId: string = randomUUID();
      const result: RecordUsageResult = {
        eventId,
        type: input.type,
        quantity: input.quantity,
        replayed: false,
      };

      await usageRepo.insertEvent(client, {
        id: eventId,
        tenantId: input.tenantId,
        type: input.type,
        quantity: input.quantity,
        costMicros: 0n, // Step 6 computes real cost
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