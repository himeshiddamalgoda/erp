import "dotenv/config";
import { Sequelize } from "sequelize";
export function createSequelize({ database, logging = false } = {}) {
  return new Sequelize(
    database || process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp",
    process.env.DB_USER || process.env.MYSQL_USER || "erp",
    process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD,
    {
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
      dialect: "mysql",
      timezone: "+00:00",
      logging,
      dialectOptions: {
        decimalNumbers: false,
        supportBigNumbers: true,
        bigNumberStrings: true,
        connectTimeout: 3000,
      },
      pool: { max: 8, min: 0, acquire: 10000 },
      define: { underscored: true, freezeTableName: true },
    },
  );
}
