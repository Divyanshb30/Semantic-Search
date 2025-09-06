// src/scripts/ingesttoChromaHTTP.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import fs from "fs/promises";
import { pipeline } from "@xenova/transformers";

// Helper function to safely make metadata ChromaDB compatible
function formatMetadata(metadata) {
  const formatted = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      formatted[key] = "N/A";
    } else if (Array.isArray(value)) {
      // Convert array items to strings safely
      formatted[key] = value.map((item) =>
        item === null || item === undefined
          ? "N/A"
          : String(item).substring(0, 500)
      );
    } else if (typeof value === "string") {
      formatted[key] = value.substring(0, 500);
    } else {
      // For safety, convert any other type to string
      formatted[key] = String(value);
    }
  }

  return formatted;
}

// Metadata validator to detect problematic fields before ingestion
function validateMetadata(metadata) {
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value !== "string" &&
      !(Array.isArray(value) && value.every((v) => typeof v === "string"))
    ) {
      return {
        valid: false,
        key,
        value,
      };
    }
  }
  return { valid: true };
}

async function generateEmbeddings(documents) {
  console.log("🧠 Generating embeddings with local model...");

  try {
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const embeddings = [];

    for (let i = 0; i < documents.length; i++) {
      console.log(`📊 Generating embedding ${i + 1}/${documents.length}...`);

      const output = await extractor(documents[i], {
        pooling: "mean",
        normalize: true,
      });

      embeddings.push(Array.from(output.data));
    }

    console.log("✅ Embeddings generated successfully!");
    return embeddings;
  } catch (error) {
    console.error("❌ Failed to generate embeddings:", error.message);
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
      },
    }
  );

  console.log("✅ Collection created with ID:", collectionResponse.data.id);
  return collectionResponse.data.id;
}

async function ingestToChroma() {
  console.log("🚀 Starting ChromaDB Data Ingestion with Local Embeddings...");

  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionName = "dtu-students";

  try {
    // 1. Load your transformed data
    console.log("📖 Reading transformed data...");
    const data = JSON.parse(
      await fs.readFile("transformed-student-data.json", "utf8")
    );
    console.log(`✅ Loaded ${data.documents.length} student documents`);

    // 2. Validate metadata for first few documents to catch errors early
    for (let i = 0; i < Math.min(10, data.documents.length); i++) {
      const validation = validateMetadata(data.documents[i].metadata);
      if (!validation.valid) {
        console.error(
          `❌ Metadata validation failed on document index ${i}, key: ${validation.key}`
        );
        console.error(`Value:`, validation.value);
        throw new Error("Metadata validation failed. Fix metadata format.");
      }
    }

    // 3. Generate embeddings for all documents
    const documents = data.documents.map((doc) => doc.content);
    const embeddings = await generateEmbeddings(documents);

    // 4. Get or create collection
    const collectionId = await getOrCreateCollection(
      baseURL,
      tenant,
      database,
      collectionName
    );

    // 5. Prepare complete payload with embeddings in batches (e.g. 50)
    const BATCH_SIZE = 50;
    for (let i = 0; i < data.documents.length; i += BATCH_SIZE) {
      const batchDocs = data.documents.slice(i, i + BATCH_SIZE);
      const batchEmbeds = embeddings.slice(i, i + BATCH_SIZE);

      const payload = {
        ids: batchDocs.map((doc) => doc.id),
        documents: batchDocs.map((doc) => doc.content),
        metadatas: batchDocs.map((doc) => formatMetadata(doc.metadata)),
        embeddings: batchEmbeds,
      };

      console.log(`📤 Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

      await axios.post(
        `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}/add`,
        payload
      );
    }

    console.log("✅ Documents added successfully!");
    console.log("🎉 SUCCESS: All documents ingested into ChromaDB!");
    console.log(`📊 Total students: ${data.documents.length}`);
    console.log("🔍 You can now perform semantic search on student data!");
  } catch (error) {
    console.error("❌ Ingestion failed:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
    throw error;
  }
}

// Run the ingestion
ingestToChroma().catch(() => {
  process.exit(1);
});
