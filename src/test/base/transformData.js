// src/scripts/transformData.js
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";

async function fetchAndTransformStudents() {
  console.log("🛠️  Fetching and transforming student data...");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Enhanced SQL query to get more data for better AI context
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
      GROUP BY sd.roll_no
      LIMIT 5;  -- Still just 5 for testing
    `;

    console.log("🔍 Executing query...");
    const [students] = await connection.execute(sqlQuery);

    console.log("✅ Successfully fetched", students.length, "students");

    // TRANSFORM THE DATA: Create AI-ready documents
    console.log("\n🎨 Transforming data into search documents...");
    console.log("=============================================");

    const studentDocuments = students.map((student) => {
      // Create a rich, descriptive text document for each student
      const document = `
        ${student.student_name}.
        From ${student.original_city}, ${student.original_country}.
        Admitted via: ${student.admission_types || "Not specified"}.
        Has been placed at companies like: ${
          student.companies || "Not placed yet"
        }.
        In roles such as: ${student.roles || "No roles specified"}.
        Placement types: ${student.placement_types || "N/A"}.
      `
        .replace(/\s+/g, " ")
        .trim(); // Clean up extra spaces and newlines

      return {
        id: student.roll_no, // Unique identifier
        name: student.student_name, // For display
        content: document, // The AI-searchable text
        metadata: {
          // Additional data for filtering
          city: student.original_city,
          country: student.original_country,
          companies: student.companies,
          admissionType: student.admission_types,
        },
      };
    });

    // Display the transformed documents
    studentDocuments.forEach((doc, index) => {
      console.log(`\n📄 DOCUMENT ${index + 1}: ${doc.name}`);
      console.log("----------------------------------------");
      console.log(doc.content);
      console.log("---");
      console.log("Metadata:", JSON.stringify(doc.metadata, null, 2));
      console.log("----------------------------------------");
    });

    console.log(
      `\n🎉 Transformation complete! Created ${studentDocuments.length} AI-ready documents.`
    );

    await connection.end();
    return studentDocuments;
  } catch (error) {
    console.error("❌ Failed to fetch/transform data:", error.message);
    throw error;
  }
}

// Run the function
fetchAndTransformStudents().catch((error) => {
  process.exit(1);
});
