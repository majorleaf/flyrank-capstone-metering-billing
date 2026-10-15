import { pool } from "../db/pool.js";
import { MeterService } from "../services/meterService.js";
import { QuotaExceededError } from "../domain/error.js";
import type { RecordUsageInput } from "../domain/types.js";

const tenantId: string | undefined = process.argv[2];
if (!tenantId) throw new Error("usage: tsx src/scratch/tokenTry.ts <tenant-uuid>");

const svc = new MeterService(pool);
const run: string = String(Date.now());

const ok: RecordUsageInput = {
  tenantId,
  type: "ai_tokens",
  idempotencyKey: `t-${run}-1`,
  tokens: { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000, reasoningTokens: 1_000 },
};
const tooBig: RecordUsageInput = {
  tenantId,
  type: "ai_tokens",
  idempotencyKey: `t-${run}-2`,
  tokens: { inputTokens: 200_000, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
};

console.log("first ", await svc.record(ok));
console.log("replay", await svc.record(ok));
try {
  await svc.record(tooBig);
} catch (err: unknown) {
  if (err instanceof QuotaExceededError) console.log("REJECTED:", err.message);
  else throw err;
}
await pool.end();