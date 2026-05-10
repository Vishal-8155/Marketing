/**
 * Reads MONGODB_URL from Netlify → Site settings → Environment variables.
 * Never put your Atlas password in index.html; it stays server-side only.
 */
const { MongoClient } = require("mongodb");

const DB_NAME = "outreach";

let clientPromise;

function getUri() {
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  if (!uri || typeof uri !== "string" || !uri.trim()) {
    throw new Error(
      "Set MONGODB_URL in Netlify → Environment variables (same value as Atlas connection string)."
    );
  }
  return uri.trim();
}

async function getDb() {
  if (!clientPromise) {
    clientPromise = new MongoClient(getUri()).connect();
  }
  const client = await clientPromise;
  return client.db(DB_NAME);
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const db = await getDb();

    if (event.httpMethod === "GET") {
      const c = (event.queryStringParameters && event.queryStringParameters.c) || "leads";
      const collName = c === "activity" ? "activity" : "leads";
      const docs = await db.collection(collName).find({}).toArray();
      const documents = docs.map((doc) => {
        const { _id, ...rest } = doc;
        return rest;
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ documents })
      };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const collName = body.collection === "activity" ? "activity" : "leads";
      const documents = Array.isArray(body.documents) ? body.documents : [];
      await db.collection(collName).deleteMany({});
      if (documents.length > 0) {
        const clean = documents.map((d) => {
          const { _id, ...rest } = d;
          return rest;
        });
        await db.collection(collName).insertMany(clean);
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
};
