import { randomUUID } from "crypto";
import { pool } from "../db/pool.js";

export const TINY_PLAN = "test_tiny";
const created: string[] = [];

export const newKey = (): string => `t-${randomUUID()}`;

export async function ensureTinyPlan(): Promise<void> {
    await pool.query(
        `INSERT INTO plans (id, name, api_calls_limit, ai_tokens_limit, price_cents)
        VALUES ($1, 'Test tiny', 3, 100000, 0) ON CONFLICT (id) DO NOTHING`,
        [TINY_PLAN],
    );
}

export async function createTenant(planId: string = TINY_PLAN, status: string = "active"): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
     "INSERT INTO tenants (name, plan_id, status) VALUES ($1, $2, $3) RETURNING id",
     [`test-${randomUUID()}`, planId, status],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("tenant insert no row");
    created.push(id);
    return id;
}

export async function countEvents(tenantId: string): Promise<number> {
    const { rows } = await pool.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM usage_events WHERE tenant_id = $1",
        [tenantId],
    );
    return Number(rows[0]?.n ?? "0")
}

export async function cleanup(): Promise<void> {
    if (created.length === 0) return;
    const ids = [...created];
    created.length = 0;
    await pool.query("DELETE FROM usage_events WHERE tenant_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM subscriptions WHERE tenant_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [ids]);
}