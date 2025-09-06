// src/scripts/ingesttoChromaHTTP.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import fs from "fs/promises";
import { pipeline } from "@xenova/transformers";

// Helper function to make metadata ChromaDB compatible
function formatMetadata(metadata) {
  const formatted = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      formatted[key] = "N/A";
    } else if (typeof value === "string") {
      formatted[key] = value.substring(0, 500);
    } else {
      formatted[key] = String(value);
    }
  }

  return formatted;
}

async function generateEmbeddings(documents) {
  console.log("🧠 Generating embeddings with local model...");

  try {
    // Load the embedding model
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const embeddings = [];

    // Generate embeddings for each document
    for (let i = 0; i < documents.length; i++) {
      console.log(`📊 Generating embedding ${i + 1}/${documents.length}...`);

      const output = await extractor(documents[i], {
        pooling: "mean",
        normalize: true,
      });

      // Convert the tensor to a regular array
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

    // 2. Generate embeddings for all documents
    const documents = data.documents.map((doc) => doc.content);
    const embeddings = await generateEmbeddings(documents);

    // 3. Get or create collection
    const collectionId = await getOrCreateCollection(
      baseURL,
      tenant,
      database,
      collectionName
    );

    // 4. Prepare complete payload with embeddings
    console.log("🛠️  Preparing final payload...");

    const payload = {
      ids: data.documents.map((doc) => doc.id),
      documents: data.documents.map((doc) => doc.content),
      metadatas: data.documents.map((doc) => formatMetadata(doc.metadata)),
      embeddings: embeddings, // Now we have the required embeddings!
    };

    console.log("📊 Embeddings shape:", {
      count: embeddings.length,
      dimensions: embeddings[0] ? embeddings[0].length : 0,
    });

    // 5. Ingest data
    console.log("📤 Uploading documents to ChromaDB...");
    const addResponse = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collectionId}/add`,
      payload
    );

    console.log("✅ Documents added successfully! Status:", addResponse.status);
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
ingestToChroma().catch((error) => {
  process.exit(1);
});
