import type { PoolClient } from "pg";

export async function recordEvent(client: PoolClient, eventId: string, type: string): Promise<boolean> {
  const { rowCount } = await client.query(
    "INSERT INTO stripe_events (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING",
    [eventId, type],
  );
  return rowCount === 1;
}

export async function findTenantByCustomer(client: PoolClient, customerId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM tenants WHERE stripe_customer_id = $1",
    [customerId],
  );
  return rows[0]?.id ?? null;
}

export async function applyTenantState(
  client: PoolClient,
  s: { tenantId: string; planId: string; status: string; customerId: string | null },
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE tenants
        SET plan_id = $2, status = $3, stripe_customer_id = COALESCE($4, stripe_customer_id)
      WHERE id = $1`,
    [s.tenantId, s.planId, s.status, s.customerId],
  );
  return rowCount === 1;
}

export async function upsertSubscription(
  client: PoolClient,
  s: { tenantId: string; stripeSubscriptionId: string; planId: string; status: string },
): Promise<void> {
  await client.query(
    `INSERT INTO subscriptions (tenant_id, stripe_subscription_id, plan_id, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stripe_subscription_id)
     DO UPDATE SET status = EXCLUDED.status, plan_id = EXCLUDED.plan_id, updated_at = now()`,
    [s.tenantId, s.stripeSubscriptionId, s.planId, s.status],
  );
}