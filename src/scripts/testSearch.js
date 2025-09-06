// test-search.js
import { searchStudents, displayResults } from "./searchData.js";

async function testSearches() {
  console.log("🧪 Testing search functionality...\n");

  const testQueries = [
    "software engineer",
    "Google",
    "Bangalore",
    "data scientist",
    "internship",
    "Microsoft",
    "product manager",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing: "${query}"`);
    try {
      const results = await searchStudents(query, "dtu-students-proper", 3);
      displayResults(results.slice(0, 3), query); // Show top 3 results

      // Add a small delay between queries
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error.message);
    }
  }

  console.log("\n✅ All tests completed!");
}

testSearches().catch(console.error);
