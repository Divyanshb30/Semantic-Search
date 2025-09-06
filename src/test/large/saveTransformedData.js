// src/scripts/saveTransformedData.js (Updated for large dataset)
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";
import fs from "fs/promises";

async function saveTransformedData() {
  console.log("💾 Saving transformed data for 800+ students...");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 10,
    });

    // SQL query to get ALL students
    const sqlQuery = `
      SELECT 
        sd.roll_no, 
        sd.student_name, 
        sd.original_city,
        sd.original_country,
        GROUP_CONCAT(DISTINCT sced.admitted_through) AS admission_types,
        GROUP_CONCAT(DISTINCT spd.company_name) AS companies,
        GROUP_CONCAT(DISTINCT spd.role_name) AS roles,
        GROUP_CONCAT(DISTINCT spd.placement_type) AS placement_types
      FROM 
        student_details sd
      LEFT JOIN 
        student_placement_data spd ON sd.roll_no = spd.roll_no
      LEFT JOIN 
        student_current_education_details sced ON sd.roll_no = sced.roll_no
      GROUP BY sd.roll_no;
    `;

    console.log("🔍 Executing query for ALL students...");
    const [students] = await connection.execute(sqlQuery);

    console.log(`✅ Fetched ${students.length} students from database`);

    // Transform students into AI-ready documents with progress tracking
    function formatList(items) {
      if (!items || items.length === 0) return "Not specified";
      if (items.length === 1) return items[0];
      return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
    }

    const studentDocuments = [];
    const totalStudents = students.length;

    for (let i = 0; i < totalStudents; i++) {
      if (i % 100 === 0) {
        console.log(`🔄 Processing student ${i + 1}/${totalStudents}...`);
      }

      const student = students[i];

      // Split comma-separated strings into arrays, or empty arrays if null/undefined
      const companiesArray = student.companies
        ? student.companies.split(",")
        : [];
      const rolesArray = student.roles ? student.roles.split(",") : [];
      const admissionArray = student.admission_types
        ? student.admission_types.split(",")
        : [];

      // Build better content string with natural language listing
      const document = `
    ${student.student_name}.
    From ${student.original_city}, ${student.original_country}.
    Admitted via: ${formatList(admissionArray)}.
    Has been placed at companies like: ${formatList(companiesArray)}.
    In roles such as: ${formatList(rolesArray)}.
    Placement types: ${student.placement_types || "N/A"}.
  `
        .replace(/\s+/g, " ")
        .trim();

      studentDocuments.push({
        id: student.roll_no,
        name: student.student_name,
        content: document,
        metadata: {
          name: student.student_name,
          city: student.original_city,
          country: student.original_country,
          companies: companiesArray,
          admissionType: admissionArray,
          roles: rolesArray,
        },
      });
    }

    // Save to a JSON file for later use
    const outputData = {
      timestamp: new Date().toISOString(),
      totalStudents: studentDocuments.length,
      documents: studentDocuments,
    };

    await fs.writeFile(
      "transformed-student-data.json",
      JSON.stringify(outputData, null, 2)
    );

    console.log(
      `\n🎉 SUCCESS: Saved ${studentDocuments.length} student documents!`
    );
    console.log("📁 Data is ready for GPU-accelerated ingestion!");

    await connection.end();
  } catch (error) {
    console.error("❌ Failed to save data:", error.message);
    throw error;
  }
}

// Run the function
saveTransformedData().catch((error) => {
  process.exit(1);
});
