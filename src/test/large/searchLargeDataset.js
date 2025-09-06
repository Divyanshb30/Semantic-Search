// src/scripts/searchLargeDataset.js
import axios from "axios";
import { pipeline } from "@xenova/transformers";
import dotenv from "dotenv";

dotenv.config();

async function generateQueryEmbeddingGPU(query) {
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

async function semanticSearchLarge(query, nResults = 5) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionName = "dtu-students-large";

  try {
    console.log(`\n🔍 Searching for: "${query}"`);
    const queryEmbedding = await generateQueryEmbeddingGPU(query);

    // Get collection ID dynamically
    const collectionsResponse = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsResponse.data.find(
      (coll) => coll.name === collectionName
    );

    if (!collection) {
      console.error("Collection not found");
      return;
    }

    const response = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/query`,
      {
        query_embeddings: [queryEmbedding],
        n_results: nResults,
      }
    );

    const results = response.data;
    console.log(`✅ Found ${results.ids[0].length} results:`);

    results.ids[0].forEach((id, index) => {
      const distance = results.distances[0][index];
      const document = results.documents[0][index];
      const metadata = results.metadatas[0][index];

      const similarity = Math.max(0, ((2 - distance) / 2) * 100);

      console.log(
        `\n${index + 1}. ${metadata.name} (${similarity.toFixed(1)}% match)`
      );
      console.log(`   📍 ${metadata.city}, ${metadata.country}`);
      console.log(`   🎓 ${metadata.admissionType}`);

      if (metadata.companies && metadata.companies !== "N/A") {
        console.log(`   💼 ${metadata.companies}`);
      }

      if (metadata.roles && metadata.roles !== "N/A") {
        console.log(`   👨‍💻 ${metadata.roles}`);
      }

      console.log(`   📝 ${document.substring(0, 80)}...`);
    });
  } catch (error) {
    console.error("❌ Search failed:", error.message);
  }
}

// Run search
async function main() {
  const queries = ["Vedant Gupta"];

  for (const query of queries) {
    await semanticSearchLarge(query);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Brief delay
  }
}

main().catch(console.error);
