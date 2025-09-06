// src/core/SimpleChromaClient.js
const axios = require("axios");
require("dotenv").config();

class SimpleChromaClient {
  constructor() {
    this.baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
    this.collectionName =
      process.env.CHROMA_COLLECTION_STUDENTS || "dtu-students";
    this.collectionId = null;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
    });
  }

  async healthCheck() {
    try {
      const response = await this.client.get("/api/v1");
      console.log("✅ ChromaDB connected successfully");
      return true;
    } catch (error) {
      console.error("❌ ChromaDB connection failed:", error.message);
      if (error.code === "ECONNREFUSED") {
        console.log("💡 Make sure ChromaDB is running on port 8000");
      }
      return false;
    }
  }

  async ensureCollection() {
    try {
      // Try to get the collection by name
      const response = await this.client.get(
        `/api/v1/collections/${this.collectionName}`
      );
      this.collectionId = response.data.id;
      console.log("📁 Using existing collection:", this.collectionName);
      return this.collectionId;
    } catch (error) {
      if (error.response?.status === 404) {
        // Collection doesn't exist, so create it
        console.log("📁 Creating new collection:", this.collectionName);
        const response = await this.client.post("/api/v1/collections", {
          name: this.collectionName,
          metadata: {
            description: "DTU Student Profiles",
            hnsw: "{}",
          },
        });
        this.collectionId = response.data.id;
        return this.collectionId;
      }
      throw error;
    }
  }

  async ingestDocuments(documents) {
    try {
      await this.ensureCollection();

      const points = documents.map((doc) => ({
        id: doc.id,
        metadata: doc.metadata || {},
        document: doc.content,
        // embedding will be generated automatically by ChromaDB
      }));

      console.log(`📤 Preparing to ingest ${documents.length} documents...`);

      const response = await this.client.post(
        `/api/v1/collections/${this.collectionId}/add`,
        {
          ids: points.map((p) => p.id),
          metadatas: points.map((p) => p.metadata),
          documents: points.map((p) => p.document),
        }
      );

      console.log(
        "✅ Successfully ingested documents. Response:",
        response.status
      );
      return response.data;
    } catch (error) {
      console.error("❌ Failed to ingest documents:");
      if (error.response) {
        console.error(
          "Server response:",
          error.response.status,
          error.response.data
        );
      } else {
        console.error("Error:", error.message);
      }
      throw error;
    }
  }
}

module.exports = SimpleChromaClient;
