import type { Pool, PoolClient, PoolOptions } from "pg";
import { string } from "zod";

type Queryable = Pool | PoolClient;

export interface TenantBilling {
    readonly planId: string;
    readonly status: string;
    readonly stripeCustomerId: string | null;
}

export async function getTenantBilling(
    db: Queryable,
    tenantId: string,
): Promise<TenantBilling | null> {
    const { rows } = await db.query<{
        plan_id: string;
        status: string;
        stripe_customer_id: string | null;
    }>("SELECT plan_id, status, stripe_customer_id FROM tenants WHERE id = $1", [tenantId]);
    const row = rows[0];
    if (!row) return null;
    return {planId: row.plan_id, status: row.status, stripeCustomerId: row.stripe_customer_id };
}