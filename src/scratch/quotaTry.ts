// src/scratch/quotaTry.ts
import { pool } from "../db/pool.js";
import { MeterService } from "../services/meterService.js";
import { QuotaExceededError } from "../domain/error.js";
import type { RecordUsageInput } from "../domain/types.js";

const tenantId: string | undefined = process.argv[2];
if (!tenantId) throw new Error("usage: tsx src/scratch/quotaTry.ts <tenant-uuid>");

const svc = new MeterService(pool);
const run: string = String(Date.now());

function req(n: number): RecordUsageInput {
  return { tenantId: tenantId as string, type: "api_call", quantity: 1, idempotencyKey: `q-${run}-${n}` };
}

async function attempt(label: string, input: RecordUsageInput): Promise<void> {
  try {
    console.log(label, await svc.record(input));
  } catch (err: unknown) {
    if (err instanceof QuotaExceededError) console.log(label, "REJECTED:", err.message);
    else throw err;
  }
}

await attempt("call 1", req(1));
await attempt("call 2", req(2));
await attempt("call 3 (boundary)", req(3));
await attempt("call 4", req(4));
await attempt("replay of call 3", req(3));
await pool.end();