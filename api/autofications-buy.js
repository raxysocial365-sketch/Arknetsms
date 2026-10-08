// api/autofications-buy.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, country, website } = req.query;

  const API_KEY = process.env.AUTOFICATIONS_API_KEY;
  const BASE = process.env.AUTOFICATIONS_BASE_URL || 'https://api.autofications.com';

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'API key not configured. Set AUTOFICATIONS_API_KEY in Vercel.'
    });
  }

  try {
    // ---------- SERVICELIST ----------
    if (action === 'servicelist') {
      if (!country) {
        return res.status(400).json({ success: false, message: 'Country required' });
      }

      const url = `${BASE}/v1/services?country=${encodeURIComponent(country)}`;
      const r = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json'
        }
      });

      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          message: data?.message || `AutoFications returned ${r.status}`,
          debug: data
        });
      }

      return res.status(200).json(data);
    }

    // ---------- GENERATE / BUY ----------
    if (action === 'generate') {
      if (!country || !website) {
        return res.status(400).json({ success: false, message: 'country and website required' });
      }

      const url = `${BASE}/v1/order`;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          country: country,
          website: website,
          operator: 'any'
        })
      });

      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          message: data?.message || `AutoFications returned ${r.status}`,
          debug: data
        });
      }

      return res.status(200).json(data);
    }

    return res.status(400).json({ success: false, message: 'Unknown action' });

  } catch (err) {
    console.error('AutoFications error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error'
    });
  }
}
