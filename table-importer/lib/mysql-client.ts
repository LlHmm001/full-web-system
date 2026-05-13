import mysql from "mysql2/promise";
import type { Pool as MysqlPool, PoolConnection as MysqlConn } from "mysql2/promise";

let pool: MysqlPool | null = null;

function resolveMysqlDatabaseUrl() {
  if (process.env.MYSQL_DATABASE_URL) {
    return process.env.MYSQL_DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "3306";
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !database || !user || !password) {
    return "";
  }

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `mysql://${auth}@${host}:${port}/${encodeURIComponent(database)}`;
}

function getMysqlPool(): MysqlPool {
  if (!pool) {
    const url = resolveMysqlDatabaseUrl();
    if (!url) {
      throw new Error(
        "MySQL configuration is required. Set MYSQL_DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD."
      );
    }
    pool = mysql.createPool(url);
  }
  return pool;
}

export async function withMysqlConnection<T>(fn: (conn: MysqlConn) => Promise<T>): Promise<T> {
  const conn = await getMysqlPool().getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}
