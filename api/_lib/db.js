import pg from "pg";
const { Pool } = pg;
let pool;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Neon database is not configured.");
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  return pool;
}
