import { Pool } from "pg";
import { config } from "../config.js";

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });

pool.on("error", (err: Error) => {
    console.error("pg idle client error", { message: err.message });

});
