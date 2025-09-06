// verify-collection.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";

async function verifyCollection() {
  const baseURL = process.env.CHROMA_HOST || "http://localhost:8000";
  const tenant = "default_tenant";
  const database = "default_database";
  const collectionName = "dtu-students-mpnet";

  try {
    console.log(`🔍 Verifying collection: ${collectionName}`);

    const collectionsRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections`
    );

    const collection = collectionsRes.data.find(
      (c) => c.name === collectionName
    );

    if (!collection) {
      console.log("❌ Collection not found!");
      return;
    }

    console.log("✅ Collection found!");
    console.log(`   ID: ${collection.id}`);
    console.log(`   Name: ${collection.name}`);
    console.log(`   Metadata: ${JSON.stringify(collection.metadata, null, 2)}`);

    // Get some stats about the collection
    const countRes = await axios.get(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/count`
    );

    console.log(`   Document count: ${countRes.data}`);

    // Get a sample of documents
    const sampleRes = await axios.post(
      `${baseURL}/api/v2/tenants/${tenant}/databases/${database}/collections/${collection.id}/get`,
      {
        limit: 2,
        include: ["metadatas", "documents"],
      }
    );

    console.log("\n📝 Sample documents:");
    sampleRes.data.ids.forEach((id, index) => {
      console.log(
        `   ${id}: ${sampleRes.data.documents[index].substring(0, 80)}...`
      );
    });
  } catch (error) {
    console.error("❌ Verification error:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
    }
  }
}

verifyCollection().catch(console.error);
