globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/getPublicBookingData/entry.ts
async function entry_default(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const response = await fetch("http://127.0.0.1:3000/api/public-booking-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({ error: "Serverfel" }));
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message || "Serverfel" }, { status: 500 });
  }
}
export {
  entry_default as default
};
