import mysql from "mysql2/promise";

export function createDatabase() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp",
    user: process.env.DB_USER || process.env.MYSQL_USER || "erp",
    password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD,
    connectionLimit: 5,
    waitForConnections: false,
    connectTimeout: 3000,
    enableKeepAlive: true,
  });

  return {
    async check() {
      const connection = await pool.getConnection();
      try {
        await connection.query({ sql: "SELECT 1", timeout: 3000 });
      } catch (error) {
        connection.destroy();
        throw error;
      } finally {
        connection.release();
      }
    },
    close() {
      return pool.end();
    },
  };
}
