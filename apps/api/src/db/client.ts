import { createPool } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { dbRelations } from "./schema.js";

// drizzle-orm@1.0.0-rc.4's mysql2 driver internally builds its client via
// `createPool` from "mysql2/promise" when given a `connection` object, but that promise-wrapped
// pool has no own `.config` — which the driver assumes exists, throwing at startup. Passing our
// own callback-style `mysql2` pool via `client` bypasses that broken code path entirely.
const pool = createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

export const db = drizzle({
  client: pool,
  relations: dbRelations,
});
