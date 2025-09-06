// src/scripts/testChromaConnection.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";

async function testChromaConnection() {
  console.log("🔗 Testing ChromaDB v2 API Connection...");

  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";

  try {
    // Test the heartbeat endpoint
    const response = await axios.get(`${baseURL}/api/v2/heartbeat`);
    console.log("✅ ChromaDB heartbeat:", response.data);

    // Test getting version info
    const versionResponse = await axios.get(`${baseURL}/api/v2/version`);
    console.log("✅ ChromaDB version:", versionResponse.data);

    console.log("🎉 ChromaDB connection test successful!");
    return true;
  } catch (error) {
    console.error("❌ ChromaDB connection failed:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
    return false;
  }
}

// Run the test
testChromaConnection().then((success) => {
  process.exit(success ? 0 : 1);
});
