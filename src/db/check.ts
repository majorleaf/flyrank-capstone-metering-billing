// src/db/check.ts
import "dotenv/config";
import { Pool } from "pg";

const databaseUrl: string | undefined = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: databaseUrl });

async function main(): Promise<void> {
  const { rows } = await pool.query<{ id: string; api_calls_limit: string }>(
    "SELECT id, api_calls_limit FROM plans ORDER BY id"
  );
  console.table(rows);
}

main()
  .catch((err: unknown) => {
    console.error("db check failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());