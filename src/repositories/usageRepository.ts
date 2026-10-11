import type { PoolClient } from "pg";
import type { UsageType } from "../domain/types.js";

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
        tenantId: string;
        type: UsageType;
        quantity: number;
        costMicros: bigint;
        idempotencyKey: string;
        requestHash: string;
        responseSnapshot: unknown;
    },
): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
        `INSERT INTO usage_events
           (tenant_id, type, quantity, cost_micros, idempotency_key, request_hash, response_snapshot)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
        [
            e.tenantId,
            e.type,
            e.quantity,
            e.costMicros.toString(),
            e.idempotencyKey,
            e.requestHash,
            JSON.stringify(e.responseSnapshot),
        ],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to insert no row");
    return row.id;
}   