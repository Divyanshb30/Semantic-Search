// src/scripts/fetchStudents.js
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";

async function fetchStudents() {
  console.log("📊 Fetching student data from MySQL...");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // SQL query to fetch student data with placements
    const sqlQuery = `
      SELECT 
        sd.roll_no, 
        sd.student_name, 
        sd.original_city,
        sd.original_country,
        GROUP_CONCAT(DISTINCT spd.company_name) AS companies,
        GROUP_CONCAT(DISTINCT spd.role_name) AS roles
      FROM 
        student_details sd
      LEFT JOIN 
        student_placement_data spd ON sd.roll_no = spd.roll_no
      GROUP BY sd.roll_no
      LIMIT 5;  -- Just get 5 students for testing
    `;

    console.log("🔍 Executing query...");
    const [students] = await connection.execute(sqlQuery);

    console.log("✅ Successfully fetched", students.length, "students");
    console.log("\n📋 Student Data:");
    console.log("=================");

    // Display the results in a clean format
    students.forEach((student, index) => {
      console.log(
        `\n${index + 1}. ${student.student_name} (${student.roll_no})`
      );
      console.log(
        `   City: ${student.original_city}, ${student.original_country}`
      );
      console.log(`   Companies: ${student.companies || "None"}`);
      console.log(`   Roles: ${student.roles || "None"}`);
    });

    await connection.end();
    console.log("\n🎉 Data fetch completed successfully!");

    return students;
  } catch (error) {
    console.error("❌ Failed to fetch student data:", error.message);
    throw error;
  }
}

// Run the function
fetchStudents().catch((error) => {
  process.exit(1);
});
