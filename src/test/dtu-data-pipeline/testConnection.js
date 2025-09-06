// testConnection.js (ESM version)
import dotenv from "dotenv";
dotenv.config();
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import mysql from "mysql2/promise";

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root directory

console.log("📁 .env file loaded from:", resolve(__dirname, "../.env"));
console.log("✅ Environment variables loaded:");
console.log("   DB_HOST:", process.env.DB_HOST);
console.log("   DB_USER:", process.env.DB_USER);
console.log(
  "   DB_PASSWORD:",
  process.env.DB_PASSWORD ? "*** (password is set)" : "NOT FOUND"
);
console.log("   DB_NAME:", process.env.DB_NAME);

async function testConnection() {
  console.log("\n🔌 Testing MySQL Connection...");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log("✅ SUCCESS: Connected to MySQL successfully!");

    // Test a simple query
    const [rows] = await connection.execute("SELECT 1 + 1 AS result");
    console.log("✅ Query test passed. Result:", rows[0].result);

    await connection.end();
    console.log("✅ Connection closed properly.");

    return true;
  } catch (error) {
    console.error("❌ FAILED: Could not connect to MySQL:", error.message);
    return false;
  }
}

// Run the test
testConnection().then((success) => {
  process.exit(success ? 0 : 1);
});
