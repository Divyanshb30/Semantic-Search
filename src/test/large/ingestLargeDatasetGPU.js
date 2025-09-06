// src/scripts/ingestLargeDatasetGPU.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import fs from "fs/promises";
import { pipeline } from "@xenova/transformers";

// Configuration for large dataset
const BATCH_SIZE = 50; // Process 50 students at a time
const PROGRESS_FILE = "ingestion-progress.json";

async function generateEmbeddingsGPU(documents) {
  console.log("🎮 Generating embeddings with GPU acceleration...");

  try {
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const allEmbeddings = [];
    const totalDocs = documents.length;

    // Process in batches to avoid memory issues
    for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      console.log(
        `📊 Generating embeddings for batch ${i / BATCH_SIZE + 1}/${Math.ceil(
          totalDocs / BATCH_SIZE
        )}...`
      );

      // Process entire batch at once (GPU can handle this efficiently)
      const outputs = await extractor(batch, {
        pooling: "mean",
        normalize: true,
      });

      // Convert tensor to array and store
      const batchEmbeddings = Array.from(outputs.data);

      // Reshape from flat array to 2D array of embeddings
      for (let j = 0; j < batch.length; j++) {
        const start = j * 384;
        const end = start + 384;
        allEmbeddings.push(batchEmbeddings.slice(start, end));
      }
    }

    console.log("✅ All embeddings generated with GPU!");
    return allEmbeddings;
  } catch (error) {
    console.error("❌ GPU embedding generation failed:", error.message);
    throw error;
  }
}

async function getOrCreateCollection(
  baseURL,
  tenant,
  database,
  collectionName
) {
  try {
    const collectionsResponse = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const existingCollection = collectionsResponse.data.find(
      (coll) => coll.name === collectionName
    );

    if (existingCollection) {
      console.log("✅ Using existing collection:", existingCollection.id);
      return existingCollection.id;
    }
  } catch (error) {
    console.log("No existing collections found, will create new one");
  }

  console.log("📁 Creating new collection...");
  const collectionResponse = await axios.post(
    `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`,
    {
      name: collectionName,
      metadata: {
        description: "DTU Student Profiles for Semantic Search",
        source: "MySQL Database",
        total_students: 800, // Estimated count
      },
    }
  );

  console.log("✅ Collection created with ID:", collectionResponse.data.id);
  return collectionResponse.data.id;
}

async function loadProgress() {
  try {
    const progress = JSON.parse(await fs.readFile(PROGRESS_FILE, "utf8"));
    return progress.lastIndex || 0;
  } catch {
    return 0;
  }
}

async function saveProgress(lastIndex) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify({ lastIndex }));
}

async function ingestLargeDatasetGPU() {
  console.log("🚀 Starting GPU-Accelerated Large Dataset Ingestion...");

  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionName = "dtu-students-large";

  try {
    // 1. Load your transformed data
    console.log("📖 Reading transformed data...");
    const data = JSON.parse(
      await fs.readFile("transformed-student-data.json", "utf8")
    );
    console.log(`✅ Loaded ${data.documents.length} student documents`);

    // 2. Get or create collection
    const collectionId = await getOrCreateCollection(
      baseURL,
      tenant,
      database,
      collectionName
    );

    // 3. Generate ALL embeddings using GPU
    const documents = data.documents.map((doc) => doc.content);
    console.log("🎮 Generating embeddings for all documents with GPU...");

    const embeddings = await generateEmbeddingsGPU(documents);
    console.log("✅ Embeddings generated!");

    // 4. Ingest in batches to avoid overwhelming the server
    const startIndex = await loadProgress();
    let successful = 0;

    for (let i = startIndex; i < data.documents.length; i += BATCH_SIZE) {
      const batch = data.documents.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

      const payload = {
        ids: batch.map((doc) => doc.id),
        documents: batch.map((doc) => doc.content),
        metadatas: batch.map((doc) => ({
          name: doc.metadata.name,
          city: doc.metadata.city,
          country: doc.metadata.country,
          companies: doc.metadata.companies,
          admissionType: doc.metadata.admissionType,
          roles: doc.metadata.roles,
        })),
        embeddings: batchEmbeddings,
      };

      await axios.post(
        `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}/add`,
        payload
      );

      successful += batch.length;
      await saveProgress(i + BATCH_SIZE);

      console.log(
        `✅ Processed ${successful}/${data.documents.length} students`
      );

      // Add small delay to avoid overwhelming the server
      if (i % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("🎉 SUCCESS: All documents ingested with GPU acceleration!");
    console.log(`📊 Total students processed: ${data.documents.length}`);
  } catch (error) {
    console.error("❌ GPU ingestion failed:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }

    // Don't exit - allow resumption
    console.log("💡 You can resume the ingestion by running the script again");
  }
}

// Run GPU ingestion
ingestLargeDatasetGPU().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
