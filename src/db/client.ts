import { drizzle } from "drizzle-orm/mysql2";
import { dbRelations } from "./schema.js";

export const db = drizzle({
  connection: {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  },
  relations: dbRelations,
});
