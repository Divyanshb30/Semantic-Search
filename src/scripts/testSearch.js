// test-hybrid.js
import { hybridSearch, displayHybridResults } from "./hybrid-search.js";

async function main() {
  console.log("🧪 Testing hybrid search with specific queries...\n");

  // Test queries that should definitely have matches
  const testQueries = [
    "Google",
    "Microsoft",
    "Policybazaar",
    "ciena",
    "Amazon",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing: "${query}"`);
    try {
      const results = await hybridSearch(query, "dtu-students-proper", 8);
      displayHybridResults(results, query);

      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error.message);
    }
  }

  console.log("\n✅ Hybrid search test completed!");
}

main().catch(console.error);
