import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Router } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../config.js";
import { stripe } from "../billing/stripeClient.js";
import { pool } from "../db/pool.js";
import { BillingService } from "../services/billingService.js";
import { MeterService } from "../services/meterService.js";
import { UsageService } from "../services/usageService.js";
import { createApp } from "./app.js";
import { cleanup, createTenant, ensureTinyPlan, newKey } from "../test/helpers.js";

let server: Server;
let base = "";

beforeAll(async () => {
  await ensureTinyPlan();
  const app = createApp({
    meter: new MeterService(pool),
    usage: new UsageService(pool),
    billing: new BillingService(pool, stripe, {
      proPriceId: config.STRIPE_PRO_PRICE_ID,
      appBaseUrl: config.APP_BASE_URL,
    }),
    webhookRouter: Router(),
  });
await new Promise<void>((resolve, reject) => {
  server = app.listen(0, (err?: Error) => (err ? reject(err) : resolve()));
});
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup();
  await pool.end();
});

const post = (tenant: string | null, key: string | null, body: unknown): Promise<Response> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenant) headers["X-Tenant-Id"] = tenant;
  if (key) headers["Idempotency-Key"] = key;
  return fetch(`${base}/generate`, { method: "POST", headers, body: JSON.stringify(body) });
};

describe("HTTP contract", () => {
  it("replay returns 200 with the same eventId", async () => {
    const t = await createTenant();
    const k = newKey();
    const a = (await (await post(t, k, { type: "api_call" })).json()) as { eventId: string };
    const res = await post(t, k, { type: "api_call" });
    const b = (await res.json()) as { eventId: string; replayed: boolean };
    expect(res.status).toBe(200);
    expect(b.eventId).toBe(a.eventId);
    expect(b.replayed).toBe(true);
  });

  it("key reuse with a different body returns 422", async () => {
    const t = await createTenant();
    const k = newKey();
    await post(t, k, { type: "api_call" });
    const res = await post(t, k, { type: "api_call", quantity: 2 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("idempotency_key_reused");
  });

  it("over the limit returns 429 with Retry-After and a message", async () => {
    const t = await createTenant();
    for (let i = 0; i < 3; i++) await post(t, newKey(), { type: "api_call" });
    const res = await post(t, newKey(), { type: "api_call" });
    const body = (await res.json()) as { error: string; message: string };
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(body.error).toBe("quota_exceeded");
    expect(body.message).toContain("quota exceeded");
  });

  it("past_due returns 402", async () => {
    const t = await createTenant("test_tiny", "past_due");
    expect((await post(t, newKey(), { type: "api_call" })).status).toBe(402);
  });

  it("missing headers return 400, never 500", async () => {
    expect((await post(null, null, { type: "api_call" })).status).toBe(400);
  });

  it("unknown tenant returns 404", async () => {
    expect((await post("00000000-0000-4000-8000-000000000000", newKey(), { type: "api_call" })).status).toBe(404);
  });
});