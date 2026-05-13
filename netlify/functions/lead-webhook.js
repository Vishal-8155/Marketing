/**
 * Forwards lead payloads to WEBHOOK_URL (Netlify / .env — never exposed to the browser).
 */
function corsHeaders(event) {
  var origin = (event.headers && (event.headers.origin || event.headers.Origin)) || "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  var webhookUrl = process.env.WEBHOOK_URL || "";
  webhookUrl = String(webhookUrl).trim().replace(/^["']|["']$/g, "");
  if (!webhookUrl || webhookUrl.indexOf("http") !== 0) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: "WEBHOOK_URL is not configured",
        hint: "Set WEBHOOK_URL in Netlify → Site → Environment variables, or in .env for netlify dev, then restart."
      })
    };
  }

  var incoming;
  try {
    incoming = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  var outbound = {
    name: incoming.name != null ? String(incoming.name).trim() : "",
    email: incoming.email != null ? String(incoming.email).trim() : "",
    mobile: String(incoming.mobile != null ? incoming.mobile : "").replace(/\D/g, ""),
    company: incoming.company != null ? String(incoming.company).trim() : "",
    website: incoming.website != null ? String(incoming.website).trim() : "",
    linkedin_url: incoming.linkedin_url != null ? String(incoming.linkedin_url).trim() : "",
    status: incoming.status != null ? String(incoming.status).trim() : ""
  };

  var body = JSON.stringify(outbound);

  var res;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json"
      },
      body: body
    });
  } catch (err) {
    console.error("lead-webhook fetch error:", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Could not reach webhook URL",
        detail: err.message || String(err)
      })
    };
  }

  var text = await res.text();
  if (!res.ok) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Webhook returned " + res.status,
        detail: text.slice(0, 500)
      })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true })
  };
};
