// api/autofications-buy.js  (Vercel Serverless)
export default async function handler(req, res) {
  const { action, country, website } = req.query;
  const API_KEY = process.env.AUTOFICATIONS_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ success: false, message: "API key not configured" });
  }

  try {
    if (action === 'servicelist') {
      const r = await fetch(`https://api.autofications.com/v1/services?country=${country}`, {
        headers: { "Authorization": `Bearer ${API_KEY}` }
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (action === 'generate') {
      const r = await fetch(`https://api.autofications.com/v1/order`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ country, website, operator: "any" })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ success: false, message: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
