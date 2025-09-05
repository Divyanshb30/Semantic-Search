// simpleIngestion.js
require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  console.log("🔄 STEP 3: Building Search Documents (with Admission Data)...");

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    console.log("✅ Connected to MySQL successfully!");

    // UPDATED QUERY: Now joining with student_current_education_details
    const sqlQuery = `
      SELECT 
        sd.roll_no, 
        sd.student_name, 
        sd.original_city,
        sd.original_country,
        -- Get the admission type (e.g., JEE Advanced, GATE)
        GROUP_CONCAT(DISTINCT sced.admitted_through) AS admission_types,
        GROUP_CONCAT(DISTINCT spd.company_name) AS companies,
        GROUP_CONCAT(DISTINCT spd.role_name) AS roles,
        GROUP_CONCAT(DISTINCT spd.placement_type) AS placement_types
      FROM 
        student_details sd
      LEFT JOIN 
        student_placement_data spd ON sd.roll_no = spd.roll_no
      -- NEW JOIN: Connect to the current education table
      LEFT JOIN 
        student_current_education_details sced ON sd.roll_no = sced.roll_no
      GROUP BY sd.roll_no
      LIMIT 10;
    `;

    console.log("\n🔍 Running Updated Query...");
    const [rows] = await connection.execute(sqlQuery);

    console.log("\n✅ Raw Data Fetched. Now building search documents:");
    console.log("------------------------------------------------");

    // FORMAT THE DATA: Create a "search document" for each student
    const studentDocuments = rows.map((student) => {
      // This is the magic step. We create a descriptive string for each student.
      const document = `
        ${student.student_name}.
        From ${student.original_city}, ${student.original_country}.
        Admitted via: ${student.admission_types || "N/A"}.
        Has been placed at companies like: ${
          student.companies || "Not placed yet"
        }.
        In roles such as: ${student.roles || "No roles specified"}.
        Placement types: ${student.placement_types || "N/A"}.
      `
        .replace(/\s+/g, " ")
        .trim(); // This cleans up extra spaces and newlines

      return {
        id: student.roll_no,
        name: student.student_name,
        document: document,
      };
    });

    // PRINT THE RESULTS
    studentDocuments.forEach((student, index) => {
      console.log(`\n📄 Document for Student #${index + 1}: ${student.name}`);
      console.log("---");
      console.log(student.document);
      console.log("---");
    });

    console.log("\n📊 Total documents created:", studentDocuments.length);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    if (connection) await connection.end();
  }
}

main();
