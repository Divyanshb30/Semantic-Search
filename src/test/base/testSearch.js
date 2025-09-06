// src/scripts/testSearch.js (Fixed version)
import axios from "axios";
import { pipeline } from "@xenova/transformers";
import dotenv from "dotenv";

dotenv.config();

async function generateQueryEmbedding(query) {
  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  const output = await extractor(query, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

async function semanticSearch(query) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionId = "a343e200-cdd1-47a8-892f-fbd81f8a1027";

  try {
    console.log(`\n🔍 Query: "${query}"`);
    const queryEmbedding = await generateQueryEmbedding(query);

    const response = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}/query`,
      {
        query_embeddings: [queryEmbedding],
        n_results: 3,
      }
    );

    const results = response.data;
    console.log("✅ Top results:");

    results.ids[0].forEach((id, index) => {
      const distance = results.distances[0][index];
      const document = results.documents[0][index];
      const metadata = results.metadatas[0][index];

      // Calculate similarity score (0-100%, higher is better)
      const similarity = Math.max(0, ((2 - distance) / 2) * 100);

      // Extract name from document text (fallback since metadata doesn't have name)
      const nameMatch = document.match(/^([^\.]+)\./);
      const name = nameMatch ? nameMatch[1] : id;

      console.log(`\n${index + 1}. ${name} (${similarity.toFixed(1)}% match)`);
      console.log(
        `   📍 ${metadata.city || "N/A"}, ${metadata.country || "N/A"}`
      );
      console.log(`   🎓 Admission: ${metadata.admissionType || "N/A"}`);

      if (metadata.companies && metadata.companies !== "N/A") {
        console.log(`   💼 Companies: ${metadata.companies}`);
      } else {
        console.log(`   💼 Not placed yet`);
      }

      if (metadata.roles && metadata.roles !== "N/A") {
        console.log(`   👨‍💻 Roles: ${metadata.roles}`);
      }

      console.log(`   📝 ${document.substring(0, 80)}...`);
    });
  } catch (error) {
    console.error("❌ Search failed:", error.message);
  }
}

async function runTests() {
  // Test with simpler queries first
  const queries = ["analyst job"];

  for (const q of queries) {
    await semanticSearch(q);
    // Add a small delay between queries
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Run tests
runTests().catch(console.error);
