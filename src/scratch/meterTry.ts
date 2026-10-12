import { pool } from "../db/pool.js";
import { IdempotencyKeyReusedError } from "../domain/error.js";
import type { RecordUsageInput } from "../domain/types.js";
import { MeterService } from "../services/meterService.js";

const tenantId: string | undefined = process.argv[2];
if (!tenantId) throw new Error("usage: tsx src/meterTry.ts <tenant-uuid>");

const svc = new MeterService(pool);

const input: RecordUsageInput = { tenantId,
     type: "api_call" as const,
      quantity: 1,
       idempotencyKey: "demo-1"};

console.log(await svc.record(input));
console.log(await svc.record(input));
await pool.end();