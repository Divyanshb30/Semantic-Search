import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";
import fs from "fs/promises";

console.log("🔍 Connecting to MySQL database...");
console.log("   DB_HOST:", process.env.DB_HOST || "NOT FOUND");

function formatList(items, defaultText = "Not specified") {
  if (!items || items.length === 0) return defaultText;
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

function safeString(val) {
  if (val === undefined || val === null) return "N/A";
  const str = String(val).trim();
  return str === "" ? "N/A" : str;
}

function formatEducation(prevEdus, higherEdus) {
  const prev = prevEdus.map(
    (e) =>
      `${safeString(e.course)} in ${safeString(
        e.specialization
      )} from ${safeString(e.institution)} (${safeString(
        e.percent_obtained
      )}%, ${safeString(e.passout_year)})`
  );
  const higher = higherEdus.map(
    (e) => `${safeString(e.exam_name)} at ${safeString(e.institute_name)}`
  );
  const combined = [...prev, ...higher];
  return combined.length ? combined.join("; ") : "No education info.";
}

function formatPlacements(prevPlacements, placements) {
  const all = [...prevPlacements, ...placements];
  if (!all || all.length === 0) return "Not placed yet.";
  return all
    .map(
      (p) =>
        `${safeString(p.role_name)} at ${safeString(
          p.company_name
        )} (${safeString(p.placement_type)})`
    )
    .join("; ");
}

function formatEntrepreneurship(entrepreneurs) {
  if (!entrepreneurs || entrepreneurs.length === 0)
    return "No entrepreneurship info.";
  return entrepreneurs
    .map(
      (e) =>
        `${safeString(e.company_name)} (${
          safeString(e.website_link) || "no website"
        })`
    )
    .join("; ");
}

function formatActivities(activities) {
  if (!activities || activities.length === 0)
    return "No extracurricular activities.";
  return activities
    .map(
      (a) =>
        `${safeString(a.event_name)} by ${safeString(
          a.organizer
        )} (${safeString(a.position)}) on ${safeString(a.event_date)}`
    )
    .join("; ");
}

function formatSocieties(societies) {
  if (!societies || societies.length === 0) return "No society details.";
  return societies
    .map(
      (s) =>
        `${safeString(s.type)} society: ${safeString(s.name)} as ${safeString(
          s.role
        )}`
    )
    .join("; ");
}

function findByRollNo(arr, roll_no) {
  return arr.filter((item) => item.roll_no === roll_no);
}

function createOptimizedDocument(
  student,
  prevEdu,
  higherEdu,
  prevPlacement,
  currentPlacement,
  entrepreneur,
  activity,
  society
) {
  const companiesArray = Array.from(
    new Set([
      ...prevPlacement.map((p) => p.company_name),
      ...currentPlacement.map((p) => p.company_name),
    ])
  ).filter((c) => c && c !== "N/A");

  const rolesArray = Array.from(
    new Set([
      ...prevPlacement.map((p) => p.role_name),
      ...currentPlacement.map((p) => p.role_name),
    ])
  ).filter((r) => r && r !== "N/A");

  // Start with clear sections
  let document = `STUDENT: ${safeString(student.student_name)}. `;
  document += `LOCATION: ${safeString(student.original_city)}, ${safeString(
    student.original_country
  )}. `;

  // Education section
  const education = formatEducation(prevEdu, higherEdu);
  if (education !== "No education info.") {
    document += `EDUCATION: ${education}. `;
  }

  // Work experience - most important for search
  if (companiesArray.length > 0) {
    document += `WORK EXPERIENCE: Worked at ${formatList(companiesArray)}. `;
    if (rolesArray.length > 0) {
      document += `ROLES: ${formatList(rolesArray)}. `;
    }

    // Add specific placement details
    const allPlacements = [...prevPlacement, ...currentPlacement];
    allPlacements.forEach((placement, index) => {
      if (placement.company_name && placement.company_name !== "N/A") {
        document += `COMPANY_${index + 1}: ${safeString(
          placement.company_name
        )}. `;
        if (placement.role_name && placement.role_name !== "N/A") {
          document += `ROLE_${index + 1}: ${safeString(placement.role_name)}. `;
        }
        if (placement.placement_type && placement.placement_type !== "N/A") {
          document += `TYPE_${index + 1}: ${safeString(
            placement.placement_type
          )}. `;
        }
      }
    });
  }

  // Other sections more concisely
  const entrepreneurship = formatEntrepreneurship(entrepreneur);
  if (entrepreneurship !== "No entrepreneurship info.") {
    document += `ENTREPRENEURSHIP: ${entrepreneurship}. `;
  }

  const activities = formatActivities(activity);
  if (activities !== "No extracurricular activities.") {
    document += `ACTIVITIES: ${activities}. `;
  }

  const societies = formatSocieties(society);
  if (societies !== "No society details.") {
    document += `SOCIETIES: ${societies}. `;
  }

  return document.replace(/\s+/g, " ").trim();
}

async function transformData() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [students] = await connection.query(
    "SELECT roll_no, student_name, original_city, original_country FROM student_details"
  );
  const [prevEdus] = await connection.query(
    "SELECT * FROM student_previous_education_details"
  );
  const [higherEdus] = await connection.query(
    "SELECT * FROM student_higher_education_details"
  );
  const [prevPlacements] = await connection.query(
    "SELECT * FROM student_previous_placement_data"
  );
  const [placements] = await connection.query(
    "SELECT * FROM student_placement_data"
  );
  const [entrepreneurs] = await connection.query(
    "SELECT * FROM student_entrepreneurship_details"
  );
  const [activities] = await connection.query(
    "SELECT * FROM student_extracurricular_activities"
  );
  const [societies] = await connection.query(
    "SELECT * FROM student_society_details"
  );
  const [images] = await connection.query("SELECT * FROM student_image");

  await connection.end();

  const transformedDocs = students.map((student) => {
    const roll_no = student.roll_no;

    const prevEdu = findByRollNo(prevEdus, roll_no);
    const higherEdu = findByRollNo(higherEdus, roll_no);
    const prevPlacement = findByRollNo(prevPlacements, roll_no);
    const currentPlacement = findByRollNo(placements, roll_no);
    const entrepreneur = findByRollNo(entrepreneurs, roll_no);
    const activity = findByRollNo(activities, roll_no);
    const society = findByRollNo(societies, roll_no);
    const image = images.find((img) => img.roll_no === roll_no);

    const content = createOptimizedDocument(
      student,
      prevEdu,
      higherEdu,
      prevPlacement,
      currentPlacement,
      entrepreneur,
      activity,
      society
    );

    return {
      id: roll_no,
      name: safeString(student.student_name),
      content,
      metadata: {
        name: safeString(student.student_name),
        city: safeString(student.original_city),
        country: safeString(student.original_country),

        // Convert arrays to comma-separated strings
        placements:
          prevPlacement.length + currentPlacement.length > 0
            ? [
                ...prevPlacement.map(
                  (p) =>
                    `${safeString(p.role_name)} at ${safeString(
                      p.company_name
                    )} (${safeString(p.placement_type)})`
                ),
                ...currentPlacement.map(
                  (p) =>
                    `${safeString(p.role_name)} at ${safeString(
                      p.company_name
                    )} (${safeString(p.placement_type)})`
                ),
              ].join("; ")
            : "N/A",

        entrepreneurships:
          entrepreneur.length > 0
            ? entrepreneur
                .map(
                  (e) =>
                    `${safeString(e.company_name)} (${
                      safeString(e.website_link) || "no website"
                    })`
                )
                .join("; ")
            : "N/A",

        extracurricular:
          activity.length > 0
            ? activity
                .map(
                  (a) =>
                    `${safeString(a.event_name)} by ${safeString(
                      a.organizer
                    )} (${safeString(a.position)})`
                )
                .join("; ")
            : "N/A",

        society:
          society.length > 0
            ? society
                .map(
                  (s) =>
                    `${safeString(s.type)}: ${safeString(
                      s.name
                    )} as ${safeString(s.role)}`
                )
                .join("; ")
            : "N/A",

        image: image?.document || "N/A",
      },
    };
  });

  await fs.writeFile(
    "transformed-student-data.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalStudents: transformedDocs.length,
        documents: transformedDocs,
      },
      null,
      2
    )
  );

  console.log(
    `✅ Saved ${transformedDocs.length} transformed student documents with improved structure.`
  );
}

transformData().catch((err) => {
  console.error("❌ Error transforming data:", err);
  process.exit(1);
});
