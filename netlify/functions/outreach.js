/**
 * Reads MONGODB_URL from Netlify → Site configuration → Environment variables.
 * Atlas: Network Access must allow 0.0.0.0/0 (or Netlify egress). User password in URI must be URL-encoded if it has @ # etc.
 */
const { MongoClient } = require("mongodb");

const DB_NAME = process.env.MONGODB_DB_NAME || "outreach";

let cachedClient = null;

function getUri() {
  let uri = process.env.MONGODB_URL || process.env.MONGODB_URI || "";
  uri = String(uri).trim();
  uri = uri.replace(/^["']|["']$/g, "");
  if (!uri) {
    throw new Error(
      "MONGODB_URL is missing. Netlify → Site → Environment variables → add MONGODB_URL with your full mongodb+srv://… string, then redeploy."
    );
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error(
      "MONGODB_URL must start with mongodb:// or mongodb+srv:// (paste the full string from Atlas → Connect → Drivers)."
    );
  }
  return uri;
}

async function getDb() {
  if (!cachedClient) {
    const uri = getUri();
    cachedClient = await new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    }).connect();
  }
  return cachedClient.db(DB_NAME);
}

function corsHeaders(event) {
  var origin = (event.headers && (event.headers.origin || event.headers.Origin)) || "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const db = await getDb();

    if (event.httpMethod === "GET") {
      const c = (event.queryStringParameters && event.queryStringParameters.c) || "leads";
      const collName = c === "activity" ? "activity" : "leads";
      const docs = await db.collection(collName).find({}).toArray();
      const documents = docs.map(function (doc) {
        var out = {};
        Object.keys(doc).forEach(function (k) {
          if (k !== "_id") out[k] = doc[k];
        });
        return out;
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ documents: documents })
      };
    }

    if (event.httpMethod === "POST") {
      var body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (pe) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid JSON body" })
        };
      }
      const collName = body.collection === "activity" ? "activity" : "leads";
      const documents = Array.isArray(body.documents) ? body.documents : [];
      const col = db.collection(collName);
      await col.deleteMany({});
      if (documents.length > 0) {
        const clean = documents.map(function (d) {
          var o = {};
          Object.keys(d).forEach(function (k) {
            if (k !== "_id") o[k] = d[k];
          });
          return o;
        });
        await col.insertMany(clean, { ordered: false });
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, saved: documents.length })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (err) {
    console.error("outreach function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message || String(err),
        hint:
          "Check Atlas Network Access (allow 0.0.0.0/0), MONGODB_URL in Netlify, URL-encoded password, and redeploy after env changes."
      })
    };
  }
};
