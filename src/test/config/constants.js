// Centralized configuration for our data ingestion queries
module.exports = {
  QUERIES: {
    STUDENTS: `
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
    `,
  },
};
