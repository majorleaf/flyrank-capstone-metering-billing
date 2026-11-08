import { config } from "../config.js";
import { pool } from "./pool.js";

export const DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
    const linked = await pool.query(
        "UPDATE plans SET stripe_price_id = $1 WHERE id = 'pro'",
        [config.STRIPE_PRO_PRICE_ID],
    );
    if (linked.rowCount !== 1) throw new Error("plan 'pro' not found; run npm run migrate first");

    await pool.query(
        `INSERT INTO tenants (id, name, plan_id, status)
        VALUES ($1, 'demo', 'free', 'active')
        ON CONFLICT (id) DO NOTHING`,
        [DEMO_TENANT_ID],
    );
    console.log(`seeded: pro plan linked to ${config.STRIPE_PRO_PRICE_ID}`);
    console.log(`demo tenant: ${DEMO_TENANT_ID}`);
}

main()
  .catch((err: unknown) => {
    console.error("seed failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => pool.end());