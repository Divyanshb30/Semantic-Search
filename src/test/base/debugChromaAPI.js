// src/scripts/debugChromaAPI.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";

async function debugChromaAPI() {
  console.log("🔍 Debugging ChromaDB API Endpoints...");

  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";

  try {
    // Try to list available endpoints or get OpenAPI spec
    console.log("1. Trying to get OpenAPI spec...");
    try {
      const specResponse = await axios.get(`${baseURL}/openapi.json`);
      console.log("✅ OpenAPI spec found");
      console.log(
        "   Available paths:",
        Object.keys(specResponse.data.paths || {})
      );
    } catch (specError) {
      console.log("❌ OpenAPI spec not available");
    }

    // Try different collection endpoints
    const endpointsToTest = [
      `${baseURL}/api/v2/collections`,
      `${baseURL}/api/v2/collections/`,
      `${baseURL}/api/collections`,
      `${baseURL}/api/collections/`,
      `${baseURL}/collections`,
      `${baseURL}/v2/collections`,
    ];

    console.log("\n2. Testing collection endpoints...");
    for (const endpoint of endpointsToTest) {
      try {
        const response = await axios.get(endpoint);
        console.log(`✅ ${endpoint} - Status: ${response.status}`);
        if (response.data && Array.isArray(response.data)) {
          console.log(`   Collections found: ${response.data.length}`);
        }
      } catch (error) {
        if (error.response) {
          console.log(`❌ ${endpoint} - Status: ${error.response.status}`);
        } else {
          console.log(`❌ ${endpoint} - Error: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error("Debug failed:", error.message);
  }
}

debugChromaAPI();
