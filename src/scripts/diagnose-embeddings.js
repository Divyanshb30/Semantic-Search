// diagnose-embeddings.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import { pipeline } from "@xenova/transformers";

async function diagnoseEmbeddings() {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  console.log("🔍 Diagnosing embedding issues...");

  try {
    // Check what collections exist
    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    console.log("📋 Available collections:");
    collectionsRes.data.forEach((collection) => {
      console.log(`   - ${collection.name} (ID: ${collection.id})`);
      if (collection.metadata) {
        console.log(`     Metadata: ${JSON.stringify(collection.metadata)}`);
      }
    });

    // Check if our new collection exists
    const targetCollection = collectionsRes.data.find(
      (c) => c.name === "dtu-students-mpnet"
    );

    if (!targetCollection) {
      console.log("❌ Collection 'dtu-students-mpnet' not found!");
      console.log("💡 Please run the improved ingestion script first:");
      console.log("   node ingest-improved.js");
      return;
    }

    console.log(`\n✅ Found target collection: ${targetCollection.name}`);
    console.log(`   Metadata: ${JSON.stringify(targetCollection.metadata)}`);

    // Test a simple query to see what's happening
    console.log("\n🧪 Testing simple query...");
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-mpnet-base-v2"
    );

    const testQuery = "software engineer";
    const queryEmbedding = await extractor(testQuery, {
      pooling: "mean",
      normalize: true,
    });

    const queryVector = Array.from(queryEmbedding.data);
    console.log(`   Query embedding dimensions: ${queryVector.length}`);
    console.log(
      `   Query embedding sample: [${queryVector.slice(0, 5).join(", ")}...]`
    );

    // Query the collection
    const searchRes = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${targetCollection.id}/query`,
      {
        query_embeddings: [queryVector],
        n_results: 3,
        include: ["metadatas", "documents", "distances"],
      }
    );

    console.log(`\n📊 Query results for "${testQuery}":`);
    console.log(
      `   Distances: ${searchRes.data.distances[0].map((d) => d.toFixed(4))}`
    );
    console.log(
      `   Similarities: ${searchRes.data.distances[0].map((d) =>
        (1 - d).toFixed(4)
      )}`
    );

    if (searchRes.data.ids[0].length > 0) {
      console.log(
        `   Top result: ${
          searchRes.data.ids[0][0]
        } (distance: ${searchRes.data.distances[0][0].toFixed(4)})`
      );
      console.log(
        `   Document snippet: ${searchRes.data.documents[0][0].substring(
          0,
          100
        )}...`
      );
    }
  } catch (error) {
    console.error("❌ Diagnosis error:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

diagnoseEmbeddings().catch(console.error);
