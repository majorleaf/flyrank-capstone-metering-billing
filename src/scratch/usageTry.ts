import { pool } from "../db/pool.js";
import { UsageService } from "../services/usageService.js";

const tenantId: string | undefined = process.argv[2];
if (!tenantId) throw new Error("usage: tsx src/scratch/usageTry.ts <tenant-uuid>");

console.log(await new UsageService(pool).getReport(tenantId));
await pool.end();