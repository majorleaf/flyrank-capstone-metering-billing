import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "./pool.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const ADVISORY_LOCK_KEY = 727001;
const BASELINE_FILE = "001_init.sql";

async function listMigrations(): Promise<string[]> {
    const names = await readdir(MIGRATIONS_DIR);
    return names.filter((n) => FILE_PATTERN.test(n)).sort();
}

async function appliedSet(client: PoolClient): Promise<Set<string>> {
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    return new Set(rows.map((r) => r.name));
}

async function adoptExistingDatabase(client: PoolClient, applied: Set<string>): Promise<void> {
    if (applied.size > 0) return;
    const { rows } = await client.query<{ present: boolean }>(
        "SELECT to_regclass('public.plans') IS NOT NULL AS present",
    );
    if (rows[0]?.present) {
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [BASELINE_FILE]);
        applied.add(BASELINE_FILE);
        console.log(`adopted existed schema as ${BASELINE_FILE}`);
    }
}

async function applyOne(client: PoolClient, name: string): Promise<void> {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
    try {
       await client.query("BEGIN");
       await client.query(sql);
       await client.query("COMMIT");
    } catch (err: unknown) {
       await client.query("ROLLBACK");
       throw err;
    }
    console.log(`applied ${name}`);
}

async function main(): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
        await client.query(
            `CREATE TABLE IF NOT EXISTS schema_migrations (
              name TEXT PRIMARY KEY,
             applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        );
        const applied = await appliedSet(client);
        await adoptExistingDatabase(client, applied);
     
        const pending = (await listMigrations()).filter((n) => !applied.has(n));
        if (pending.length === 0) console.log("database is up to date");
        for (const name of pending) await applyOne(client, name);
    } finally {
         await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
         client.release();
    }
}

main()
   .catch((err: unknown) => {
    console.error("migrate failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
   })
   .finally(() => pool.end());