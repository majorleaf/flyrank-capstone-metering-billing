import { config } from "../config.js";
import { pool } from "./pool.js";

async function main(): Promise<void> {
  console.log("env ok, port:", config.PORT);
  const { rows } = await pool.query<{ id: string; api_calls_limit: string }>(
    "SELECT id, api_calls_limit FROM plans ORDER BY id"
  );
  console.table(rows);
}
main()
.catch((err: unknown) => {
  console.error("db check failed:", err instanceof Error ? err.message : err );
  process.exitCode = 1;
})
.finally(() => pool.end());
