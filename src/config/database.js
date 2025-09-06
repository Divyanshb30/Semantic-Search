import dotenv from "dotenv";

import mysql from "mysql2/promise";
dotenv.config();

console.log("🔍 Loaded environment variables:");
console.log("   DB_HOST:", process.env.DB_HOST || "NOT FOUND");
console.log("   DB_USER:", process.env.DB_USER || "NOT FOUND");
console.log(
  "   DB_PASSWORD:",
  process.env.DB_PASSWORD ? "*** (password is set)" : "NOT FOUND"
);
console.log("   DB_NAME:", process.env.DB_NAME || "NOT FOUND");
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
};

const pool = mysql.createPool(dbConfig);

module.exports = pool;
