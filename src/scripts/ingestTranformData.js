// recreate-embeddings-proper.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import fs from "fs/promises";
import { pipeline } from "@xenova/transformers";

const BATCH_SIZE = 16;

async function deleteCollection(collectionName) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  try {
    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsRes.data.find(
      (c) => c.name === collectionName
    );

    if (collection) {
      console.log(`🗑️  Deleting existing collection: ${collectionName}`);
      await axios.delete(
        `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}`
      );
      console.log("✅ Collection deleted");
    }
  } catch (error) {
    console.log("No existing collection to delete or error:", error.message);
  }
}

async function generateEmbeddings(documents) {
  console.log("🎮 Generating embeddings with all-mpnet-base-v2...");
  console.log(`📊 Total documents: ${documents.length}`);

  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-mpnet-base-v2"
  );

  const allEmbeddings = [];

  // Test the model first
  console.log("🧪 Testing model with sample document...");
  const testEmbedding = await extractor(documents[0], {
    pooling: "mean",
    normalize: true,
  });
  console.log(
    `✅ Model working. Embedding dimensions: ${testEmbedding.dims[1]}`
  );

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    console.log(
      `📊 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        documents.length / BATCH_SIZE
      )}...`
    );

    try {
      const outputs = await extractor(batch, {
        pooling: "mean",
        normalize: true,
      });

      const flatArray = Array.from(outputs.data);
      const embeddingSize = outputs.dims[1]; // Get actual embedding size

      for (let j = 0; j < batch.length; j++) {
        allEmbeddings.push(
          flatArray.slice(j * embeddingSize, (j + 1) * embeddingSize)
        );
      }
    } catch (error) {
      console.error(`❌ Error processing batch:`, error.message);
      throw error;
    }
  }
  console.log("✅ All embeddings generated!");
  console.log(`📏 Embedding dimensions: ${allEmbeddings[0].length}`);
  return allEmbeddings;
}

async function createCollection(collectionName) {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";

  console.log("📁 Creating new collection...");
  const createRes = await axios.post(
    `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`,
    {
      name: collectionName,
      metadata: {
        description:
          "DTU Student Profiles with proper all-mpnet-base-v2 embeddings",
        source: "MySQL Database",
        embedding_model: "Xenova/all-mpnet-base-v2",
        dimensions: 768,
        created_at: new Date().toISOString(),
        total_students: 0,
      },
    }
  );

  console.log("✅ Collection created with ID:", createRes.data.id);
  return createRes.data.id;
}

async function verifyEmbeddings(embeddings) {
  console.log("🔍 Verifying embeddings...");

  // Check if embeddings are normalized
  const sampleEmbedding = embeddings[0];
  const magnitude = Math.sqrt(
    sampleEmbedding.reduce((sum, val) => sum + val * val, 0)
  );
  console.log(`📏 Sample embedding magnitude: ${magnitude.toFixed(6)}`);

  if (Math.abs(magnitude - 1.0) > 0.01) {
    console.warn("⚠️  Embeddings may not be properly normalized");
  } else {
    console.log("✅ Embeddings are properly normalized");
  }

  return embeddings;
}

async function ingest() {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionName = "dtu-students-proper";

  console.log("📖 Reading transformed data...");
  const dataStr = await fs.readFile("transformed-student-data.json", "utf8");
  const data = JSON.parse(dataStr);

  console.log(`📊 Total students: ${data.documents.length}`);

  // Delete existing collection first
  await deleteCollection(collectionName);

  const documentsContent = data.documents.map((doc) => doc.content);
  const embeddings = await generateEmbeddings(documentsContent);
  await verifyEmbeddings(embeddings);

  const collectionId = await createCollection(collectionName);

  let successCount = 0;
  for (let i = 0; i < data.documents.length; i += BATCH_SIZE) {
    const batchDocs = data.documents.slice(i, i + BATCH_SIZE);
    const batchEmbeds = embeddings.slice(i, i + BATCH_SIZE);

    const payload = {
      ids: batchDocs.map((d) => d.id),
      documents: batchDocs.map((d) => d.content),
      metadatas: batchDocs.map((d) => d.metadata),
      embeddings: batchEmbeds,
    };

    try {
      await axios.post(
        `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}/add`,
        payload
      );
      successCount += batchDocs.length;

      console.log(
        `✅ Ingested batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          data.documents.length / BATCH_SIZE
        )} (${successCount}/${data.documents.length})`
      );
    } catch (error) {
      console.error(`❌ Error ingesting batch:`, error.message);
      throw error;
    }
  }

  // Update collection count
  try {
    await axios.patch(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}`,
      {
        metadata: {
          total_students: successCount,
          completed_at: new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    console.log("Could not update collection metadata:", error.message);
  }

  console.log("🎉 All students ingested successfully!");
  console.log("📋 Collection name:", collectionName);
  console.log("🚀 Model: all-mpnet-base-v2");
  console.log("📏 Dimensions: 768");
  console.log("👥 Total students:", successCount);
}

ingest().catch((err) => {
  console.error("❌ Error ingesting data:", err);
  process.exit(1);
});
