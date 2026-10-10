// api/textverified-buy.js
// TextVerified API proxy for Arknet SMS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, service, request_id, phone } = req.query;

  const API_KEY = process.env.TEXTVERIFIED_API_KEY;
  const BASE = 'https://www.textverified.com/api/pub/v2';

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'TextVerified API key not configured. Set TEXTVERIFIED_API_KEY in Vercel.'
    });
  }

  const headers = {
    'X-API-KEY': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  try {
    // ---------- BALANCE ----------
    if (action === 'balance') {
      const r = await fetch(`${BASE}/balance`, { headers });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({ success: r.ok, data });
    }

    // ---------- SERVICELIST ----------
    if (action === 'servicelist') {
      const r = await fetch(`${BASE}/services`, { headers });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          message: data?.message || `TextVerified returned ${r.status}`,
          debug: data
        });
      }

      // Normalize: TextVerified returns array OR {services: [...]}
      let list = [];
      if (Array.isArray(data)) list = data;
      else if (Array.isArray(data.services)) list = data.services;
      else if (Array.isArray(data.data)) list = data.data;

      const services = list.map(s => ({
        id: String(s.id || s.serviceId || s.name || ''),
        name: String(s.name || s.serviceName || s.title || '').trim(),
        price: Number(s.price || s.cost || 0.25)
      })).filter(s => s.id && s.name);

      return res.status(200).json({ success: true, services });
    }

    // ---------- GENERATE ----------
    if (action === 'generate') {
      if (!service) {
        return res.status(400).json({ success: false, message: 'Missing service name' });
      }

      const r = await fetch(`${BASE}/verifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          service_name: service,
          capability: 'sms'
        })
      });

      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          message: data?.message || data?.error || 'No number available',
          debug: data
        });
      }

      const number = data.number || data.phone_number || data.phoneNumber;
      const id = data.id || data.verification_id || data.verificationId;

      if (!number) {
        return res.status(200).json({ success: false, message: 'No number available right now', debug: data });
      }

      return res.status(200).json({
        success: true,
        number: String(number),
        request_id: String(id || '')
      });
    }

    // ---------- READ SMS ----------
    if (action === 'read') {
      if (!request_id) {
        return res.status(400).json({ success: false, message: 'Missing request_id' });
      }
      const r = await fetch(`${BASE}/verifications/${request_id}/sms`, { headers });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const code = data.sms || data.code || data.message || '';
      return res.status(200).json({
        success: true,
        code: String(code || '').trim(),
        found: Boolean(code),
        raw: data
      });
    }

    // ---------- CANCEL ----------
    if (action === 'cancel') {
      if (!request_id) {
        return res.status(400).json({ success: false, message: 'Missing request_id' });
      }
      const r = await fetch(`${BASE}/verifications/${request_id}`, {
        method: 'DELETE',
        headers
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({
        success: r.ok,
        raw: data
      });
    }

    return res.status(400).json({ success: false, message: 'Unknown action' });

  } catch (err) {
    console.error('TextVerified proxy error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
