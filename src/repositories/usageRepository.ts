import type { PoolClient } from "pg";
import type { UsageType } from "../domain/types.js";
import type { TenantNotFoundError } from "../domain/error.js";
import { start } from "repl";

export interface StoredEvent {
    readonly id: string;
    readonly requestHash: string;
    readonly responseSnapshot: unknown; 
}

export async function lockTenant(client: PoolClient, tenantId: string): Promise<boolean> {
    const { rowCount } = await client.query(
        "SELECT id FROM tenants WHERE id = $1 FOR UPDATE",          
        [tenantId],
    );
    return rowCount === 1;
}

export async function findByKey(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
): Promise<StoredEvent | null> {
    const { rows } = await client.query<{
        id: string;
        request_hash: string;   
        response_snapshot: unknown;
    }>(
        `SELECT id, request_hash, response_snapshot
           FROM usage_events
          WHERE tenant_id = $1 AND idempotency_key = $2`,   
        [tenantId, idempotencyKey],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, requestHash: row.request_hash, responseSnapshot: row.response_snapshot };
}

export async function insertEvent(
    client: PoolClient,
    e: {  
        id: string;      
        tenantId: string;
        type: UsageType;
        quantity: number;
        costMicros: bigint;
        idempotencyKey: string;
        requestHash: string;
        responseSnapshot: unknown;
    },
): Promise<void> {
   await client.query(
  "INSERT INTO usage_events (id, tenant_id, type, quantity, cost_micros, idempotency_key, request_hash, response_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
  [
    e.id,
    e.tenantId,
    e.type,
    e.quantity,
    e.costMicros.toString(),
    e.idempotencyKey,
    e.requestHash,
    JSON.stringify(e.responseSnapshot),
  ],
    );
}  

export interface Tenantplan {
    readonly status: string;
    readonly apiCallsLimit: number;
    readonly aiTokensLimit: number;
}

export async function getTenantPlan(
    client: PoolClient,
    tenantId: string,
): Promise<Tenantplan | null> {
    const { rows } = await client.query<{
        status: string;
        api_calls_limit: string;
        ai_tokens_limit: string;
    }>(
        `SELECT t.status, p.api_calls_limit, p.ai_tokens_limit
         FROM tenants t 
        JOIN plans p ON P.id = t.plan_id
        WHERE t.id = $1`,
        [tenantId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
        status: row.status,
        apiCallsLimit: Number(row.api_calls_limit),
        aiTokensLimit: Number(row.ai_tokens_limit),
    };
}

export async function sumUsage(
    client: PoolClient,
    tenantId: string,
    type: UsageType,
    end: Date,
): Promise<number> {
    const { rows } = await client.query<{ used: string }>(
        `SELECT COALESCE(SUM(quantity), 0)::text AS used
         FROM usage_events
         WHERE tenant_id = $1 AND type = $2
          AND  occurred_at >= $3 AND occurred_at < $4`,
          [tenantId, type, start, end],
    );
    return Number(rows[0]?.used ?? "0");
}