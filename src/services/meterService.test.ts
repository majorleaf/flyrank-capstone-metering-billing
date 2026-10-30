import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { MeterService } from "./meterService.js";
import {
    IdempotencyKeyReusedError,
    PaymentRequiredError,
    QuotaExceededError,
} from "../domain/error.js";
import type { ApiCallInput } from "../domain/types.js";
import { cleanup, countEvents, createTenant, ensureTinyPlan, newKey } from "../test/helpers.js";

const svc = new MeterService(pool);

const call = (tenantId: string, idempotencyKey: string, quantity = 1): ApiCallInput => ({
    tenantId,
    idempotencyKey,
    type: "api_call",
    quantity,
});


beforeAll(ensureTinyPlan);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("idempotency (Probe 1)", () => {
  it("same key twice creates one event and mirrors the response", async () => {
    const t = await createTenant();
    const k = newKey();
    const first = await svc.record(call(t, k));
    const second = await svc.record(call(t, k));
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.eventId).toBe(first.eventId);
    expect(await countEvents(t)).toBe(1);
  });

  it("same key with a different payload is rejected", async () => {
    const t = await createTenant();
    const k = newKey();
    await svc.record(call(t, k, 1));
    await expect(svc.record(call(t, k, 2))).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    expect(await countEvents(t)).toBe(1);
  });

  it("concurrent retries of one key create one event", async () => {
    const t = await createTenant();
    const k = newKey();
    await Promise.all([svc.record(call(t, k)), svc.record(call(t, k)), svc.record(call(t, k))]);
    expect(await countEvents(t)).toBe(1);
  });
});

describe("quota boundary (Probe 2)", () => {
  it("allows the call that lands on the limit, rejects the next", async () => {
    const t = await createTenant();
    for (let i = 0; i < 3; i++) await svc.record(call(t, newKey()));
    await expect(svc.record(call(t, newKey()))).rejects.toBeInstanceOf(QuotaExceededError);
    expect(await countEvents(t)).toBe(3);
  });

  it("a replay at the boundary returns the original success", async () => {
    const t = await createTenant();
    await svc.record(call(t, newKey()));
    await svc.record(call(t, newKey()));
    const k = newKey();
    const third = await svc.record(call(t, k));
    const replay = await svc.record(call(t, k));
    expect(replay.replayed).toBe(true);
    expect(replay.eventId).toBe(third.eventId);
  });

  it("two concurrent requests at 2 of 3 admit exactly one", async () => {
    const t = await createTenant();
    await svc.record(call(t, newKey()));
    await svc.record(call(t, newKey()));
    const results = await Promise.allSettled([svc.record(call(t, newKey())), svc.record(call(t, newKey()))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected[0]?.reason).toBeInstanceOf(QuotaExceededError);
    expect(await countEvents(t)).toBe(3);
  });

  it("a past_due tenant gets a payment-required error", async () => {
    const t = await createTenant("test_tiny", "past_due");
    await expect(svc.record(call(t, newKey()))).rejects.toBeInstanceOf(PaymentRequiredError);
  });
});

describe("ai_tokens cost (Probe 5)", () => {
  it("stores quantity 13000 and cost 19000 micros", async () => {
    const t = await createTenant();
    const r = await svc.record({
      tenantId: t,
      idempotencyKey: newKey(),
      type: "ai_tokens",
      tokens: { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000, reasoningTokens: 1_000 },
    });
    expect(r.quantity).toBe(13_000);
    expect(r.costMicros).toBe("19000");
  });
});