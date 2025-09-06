// hybrid-search.js
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

async function semanticSearch(
  query,
  collectionName = "dtu-students-proper",
  limit = 20
) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  try {
    // Get collection ID
    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsRes.data.find(
      (c) => c.name === collectionName
    );
    if (!collection)
      throw new Error(`Collection "${collectionName}" not found.`);

    // Generate query embedding
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-mpnet-base-v2"
    );

    const enhancedQuery = enhanceQuery(query);
    const queryEmbedding = await extractor(enhancedQuery, {
      pooling: "mean",
      normalize: true,
    });

    const queryVector = Array.from(queryEmbedding.data);

    // Perform semantic search
    const searchPayload = {
      query_embeddings: [queryVector],
      n_results: limit,
      include: ["metadatas", "documents", "distances"],
    };

    const searchRes = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/query`,
      searchPayload
    );

    // Process semantic results
    return searchRes.data.ids[0].map((id, index) => {
      const distance = searchRes.data.distances[0][index];
      const cosineSimilarity = 1 - (distance * distance) / 2;

      return {
        id,
        semanticSimilarity: cosineSimilarity,
        name: searchRes.data.metadatas[0][index]?.name || "Unknown",
        city: searchRes.data.metadatas[0][index]?.city || "N/A",
        country: searchRes.data.metadatas[0][index]?.country || "N/A",
        placements: searchRes.data.metadatas[0][index]?.placements || "N/A",
        content: searchRes.data.documents[0][index] || "",
        metadata: searchRes.data.metadatas[0][index] || {},
        type: "semantic",
      };
    });
  } catch (error) {
    console.error("Semantic search error:", error.message);
    return [];
  }
}

async function keywordSearch(
  query,
  collectionName = "dtu-students-proper",
  limit = 20
) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  try {
    // Get collection ID
    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsRes.data.find(
      (c) => c.name === collectionName
    );
    if (!collection)
      throw new Error(`Collection "${collectionName}" not found.`);

    // Get all documents for keyword search
    const allDocsRes = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/get`,
      {
        include: ["metadatas", "documents"],
        limit: 1000, // Get all documents for keyword search
      }
    );

    const queryLower = query.toLowerCase();
    const keywordResults = [];

    // Perform keyword matching
    allDocsRes.data.ids.forEach((id, index) => {
      const content = allDocsRes.data.documents[index] || "";
      const metadata = allDocsRes.data.metadatas[index] || {};
      const contentLower = content.toLowerCase();
      const placementsLower = (metadata.placements || "").toLowerCase();

      let keywordScore = 0;

      // Score based on keyword matches
      if (contentLower.includes(queryLower)) {
        keywordScore += 2.0;
        // Additional points for multiple occurrences
        const occurrences = (
          contentLower.match(new RegExp(queryLower, "g")) || []
        ).length;
        keywordScore += Math.min(occurrences * 0.5, 2.0);
      }

      if (placementsLower.includes(queryLower)) {
        keywordScore += 3.0; // Higher weight for placement matches
      }

      if (metadata.name && metadata.name.toLowerCase().includes(queryLower)) {
        keywordScore += 4.0; // Highest weight for name matches
      }

      if (keywordScore > 0) {
        keywordResults.push({
          id,
          keywordScore,
          name: metadata.name || "Unknown",
          city: metadata.city || "N/A",
          country: metadata.country || "N/A",
          placements: metadata.placements || "N/A",
          content: content,
          metadata: metadata,
          type: "keyword",
        });
      }
    });

    // Sort by keyword score and take top results
    return keywordResults
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, limit);
  } catch (error) {
    console.error("Keyword search error:", error.message);
    return [];
  }
}

function calculateHybridScore(
  result,
  query,
  maxSemanticScore,
  maxKeywordScore
) {
  const queryLower = query.toLowerCase();
  const contentLower = result.content.toLowerCase();
  const placementsLower = (result.metadata.placements || "").toLowerCase();

  let hybridScore = 0;

  if (result.type === "semantic") {
    // Normalize semantic score to 0-1 range
    const normalizedSemantic = result.semanticSimilarity;
    hybridScore += normalizedSemantic * 0.6; // 60% weight to semantic

    // Add keyword bonuses to semantic results
    if (contentLower.includes(queryLower)) {
      hybridScore += 0.3;
    }
    if (placementsLower.includes(queryLower)) {
      hybridScore += 0.4;
    }
    if (
      result.metadata.name &&
      result.metadata.name.toLowerCase().includes(queryLower)
    ) {
      hybridScore += 0.5;
    }
  } else {
    // Normalize keyword score to 0-1 range
    const normalizedKeyword = Math.min(result.keywordScore / 10, 1.0);
    hybridScore += normalizedKeyword * 0.7; // 70% weight to keyword

    // Add semantic-like scoring for keyword results
    const queryWords = queryLower.split(/\s+/);
    let contentMatch = 0;
    queryWords.forEach((word) => {
      if (word.length > 2 && contentLower.includes(word)) {
        contentMatch += 0.1;
      }
    });
    hybridScore += Math.min(contentMatch, 0.3);
  }

  return hybridScore;
}

async function hybridSearch(
  query,
  collectionName = "dtu-students-proper",
  limit = 10
) {
  console.log(`🔍 Performing hybrid search for: "${query}"`);

  // Run both searches in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, collectionName, limit * 2),
    keywordSearch(query, collectionName, limit * 2),
  ]);

  console.log(`📊 Semantic results: ${semanticResults.length}`);
  console.log(`📊 Keyword results: ${keywordResults.length}`);

  // Combine and deduplicate results
  const allResults = [];
  const seenIds = new Set();

  // Add semantic results first
  semanticResults.forEach((result) => {
    if (!seenIds.has(result.id)) {
      seenIds.add(result.id);
      allResults.push(result);
    }
  });

  // Add keyword results that aren't already included
  keywordResults.forEach((result) => {
    if (!seenIds.has(result.id)) {
      seenIds.add(result.id);
      allResults.push(result);
    }
  });

  // Calculate max scores for normalization
  const maxSemanticScore = Math.max(
    ...semanticResults.map((r) => r.semanticSimilarity),
    0.1
  );
  const maxKeywordScore = Math.max(
    ...keywordResults.map((r) => r.keywordScore),
    1
  );

  // Calculate hybrid scores
  const scoredResults = allResults.map((result) => {
    const hybridScore = calculateHybridScore(
      result,
      query,
      maxSemanticScore,
      maxKeywordScore
    );

    return {
      ...result,
      hybridScore: hybridScore.toFixed(4),
      finalScore: hybridScore,
      hasExactMatch:
        result.content.toLowerCase().includes(query.toLowerCase()) ||
        (result.metadata.placements &&
          result.metadata.placements
            .toLowerCase()
            .includes(query.toLowerCase())),
    };
  });

  // Sort by hybrid score and return top results
  return scoredResults
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}

function displayHybridResults(results, query) {
  console.log("\n" + "=".repeat(100));
  console.log(`🎯 HYBRID SEARCH RESULTS FOR: "${query}"`);
  console.log(`📈 Found ${results.length} matches`);
  console.log("=".repeat(100));

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
    console.log(`   🔍 Type: ${result.type.toUpperCase()}`);
    console.log(`   ⭐ Hybrid Score: ${result.hybridScore}`);

    if (result.type === "semantic") {
      console.log(`   🧠 Semantic: ${result.semanticSimilarity.toFixed(4)}`);
    } else {
      console.log(`   🔑 Keyword: ${result.keywordScore.toFixed(1)}`);
    }

    if (result.hasExactMatch) {
      console.log(`   ✅ Exact match found`);
    }
    console.log(`   🆔 Student ID: ${result.id}`);
    console.log("-".repeat(80));

    // Show most relevant snippet
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

  // Show summary
  const semanticCount = results.filter((r) => r.type === "semantic").length;
  const keywordCount = results.filter((r) => r.type === "keyword").length;
  const avgScore = (
    results.reduce((sum, r) => sum + parseFloat(r.hybridScore), 0) /
    results.length
  ).toFixed(4);

  console.log(
    `\n📊 Summary: ${semanticCount} semantic + ${keywordCount} keyword results, Avg score: ${avgScore}`
  );
}

async function interactiveHybridSearch() {
  console.log("🎯 DTU Student Hybrid Search Interface");
  console.log("📚 Collection: dtu-students-proper");
  console.log("🚀 Using hybrid search (semantic + keyword)");
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
      console.log("⏳ Performing hybrid search...");
      const results = await hybridSearch(query.trim());
      displayHybridResults(results, query);
    } catch (error) {
      console.error("Search failed:", error.message);
    }
  }

  rl.close();
}

// Test function
async function testHybridSearch() {
  console.log("🧪 Testing hybrid search functionality...\n");

  const testQueries = [
    "Google",
    "Microsoft",
    "software engineer",
    "data scientist",
    "Bangalore",
    "Policybazaar",
    "ciena",
    "product manager",
    "internship",
    "Amazon",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing: "${query}"`);
    try {
      const results = await hybridSearch(query, "dtu-students-proper", 5);
      displayHybridResults(results, query);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error.message);
    }
  }

  console.log("\n✅ All hybrid tests completed!");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "test") {
    testHybridSearch().catch(console.error);
  } else {
    interactiveHybridSearch().catch(console.error);
  }
}

export { hybridSearch, displayHybridResults };
