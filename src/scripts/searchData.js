// improved-search.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import { pipeline } from "@xenova/transformers";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function enhanceQuery(query) {
  // Add synonyms and context to improve search
  const enhancements = {
    google: "Google tech company software engineer",
    microsoft: "Microsoft tech software company",
    amazon: "Amazon ecommerce tech company",
    bangalore: "Bangalore Bengaluru city India",
    "data scientist": "data science machine learning AI",
    "product manager": "product management business strategy",
    "software engineer": "software development programming coding",
    developer: "software development programming",
    internship: "intern work experience training",
    ciena: "Ciena networking telecommunications",
  };

  let enhanced = query.toLowerCase();

  Object.entries(enhancements).forEach(([key, value]) => {
    if (enhanced.includes(key.toLowerCase())) {
      enhanced += " " + value;
    }
  });

  return enhanced;
}

async function searchStudents(
  query,
  collectionName = "dtu-students-proper",
  limit = 10
) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  console.log(`🔍 Searching for: "${query}"`);

  try {
    // Get collection ID
    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsRes.data.find(
      (c) => c.name === collectionName
    );

    if (!collection) {
      throw new Error(`Collection "${collectionName}" not found.`);
    }

    // Generate query embedding with enhanced query
    console.log("🧠 Generating query embedding...");
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-mpnet-base-v2"
    );

    const enhancedQuery = enhanceQuery(query);
    console.log(`📝 Enhanced query: "${enhancedQuery}"`);

    const queryEmbedding = await extractor(enhancedQuery, {
      pooling: "mean",
      normalize: true,
    });

    const queryVector = Array.from(queryEmbedding.data);

    // Perform the search with more results
    console.log("📡 Querying ChromaDB...");
    const searchPayload = {
      query_embeddings: [queryVector],
      n_results: Math.min(limit * 2, 20), // Get more results for better ranking
      include: ["metadatas", "documents", "distances"],
    };

    const searchRes = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/query`,
      searchPayload
    );

    // Process results with proper similarity calculation
    const results = searchRes.data.ids[0].map((id, index) => {
      const distance = searchRes.data.distances[0][index];
      const cosineSimilarity = 1 - (distance * distance) / 2;

      const content = searchRes.data.documents[0][index] || "";
      const metadata = searchRes.data.metadatas[0][index] || {};

      // Calculate relevance score based on exact matches
      let relevanceScore = cosineSimilarity;
      const queryLower = query.toLowerCase();
      const contentLower = content.toLowerCase();

      if (contentLower.includes(queryLower)) {
        relevanceScore += 0.2; // Boost for exact match
      }
      if (
        metadata.placements &&
        metadata.placements.toLowerCase().includes(queryLower)
      ) {
        relevanceScore += 0.3; // Extra boost for placement matches
      }

      return {
        id,
        similarity: cosineSimilarity.toFixed(4),
        relevanceScore: relevanceScore.toFixed(4),
        name: metadata.name || "Unknown",
        city: metadata.city || "N/A",
        country: metadata.country || "N/A",
        placements: metadata.placements || "N/A",
        content: content,
        distance: distance.toFixed(4),
        hasExactMatch:
          contentLower.includes(queryLower) ||
          (metadata.placements &&
            metadata.placements.toLowerCase().includes(queryLower)),
      };
    });

    // Sort by relevance score (highest first)
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  } catch (error) {
    console.error("❌ Search error:", error.message);
    throw error;
  }
}

function displayResults(results, query) {
  console.log("\n" + "=".repeat(90));
  console.log(`📊 SEARCH RESULTS FOR: "${query}"`);
  console.log(`📈 Found ${results.length} matches`);
  console.log("=".repeat(90));

  if (results.length === 0) {
    console.log("❌ No results found. Try a different search term.");
    console.log(
      "💡 Try searching for: company names, roles, cities, or skills"
    );
    return;
  }

  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.name}`);
    console.log(`   📍 Location: ${result.city}, ${result.country}`);
    console.log(
      `   💼 Placements: ${result.placements.substring(0, 80)}${
        result.placements.length > 80 ? "..." : ""
      }`
    );
    console.log(`   🔍 Similarity: ${result.similarity}`);
    console.log(`   ⭐ Relevance: ${result.relevanceScore}`);
    console.log(`   📏 Distance: ${result.distance}`);
    if (result.hasExactMatch) {
      console.log(`   ✅ Exact match found`);
    }
    console.log(`   🆔 Student ID: ${result.id}`);
    console.log("-".repeat(70));

    // Show relevant snippet
    const contentLower = result.content.toLowerCase();
    const queryLower = query.toLowerCase();

    let snippet = result.content.substring(0, 120);
    if (contentLower.includes(queryLower)) {
      const start = Math.max(0, contentLower.indexOf(queryLower) - 40);
      const end = Math.min(
        contentLower.length,
        contentLower.indexOf(queryLower) + query.length + 60
      );
      snippet = result.content.substring(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < contentLower.length) snippet = snippet + "...";
    }

    console.log(`   📝 ${snippet}`);
  });
}

async function interactiveSearch() {
  console.log("🎯 DTU Student Search Interface");
  console.log("📚 Collection: dtu-students-proper");
  console.log("🚀 Using enhanced search with query expansion");
  console.log("❌ Type 'exit' to quit\n");

  while (true) {
    const query = await askQuestion("\n🔍 Enter your search query: ");

    if (query.toLowerCase() === "exit") {
      console.log("👋 Goodbye!");
      break;
    }

    if (!query.trim()) {
      console.log("⚠️  Please enter a search query.");
      continue;
    }

    try {
      console.log("⏳ Searching...");
      const results = await searchStudents(query.trim());
      displayResults(results, query);
    } catch (error) {
      console.error("Search failed:", error.message);
    }
  }

  rl.close();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  interactiveSearch().catch(console.error);
}

export { searchStudents, displayResults };
