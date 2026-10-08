// api/autofications-buy.js
// AutoFications proxy for Arknet SMS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, country, website, phone_number } = req.query;

  const USERNAME = process.env.AUTOFICATIONS_USERNAME;
  const KEY = process.env.AUTOFICATIONS_API_KEY;
  const BASE = 'https://autofications.com/V2/API.php';

  if (!USERNAME || !KEY) {
    return res.status(500).json({
      success: false,
      message: 'API credentials missing. Set AUTOFICATIONS_USERNAME and AUTOFICATIONS_API_KEY in Vercel.'
    });
  }

  try {
    const params = new URLSearchParams();
    params.set('username', USERNAME);
    params.set('key', KEY);
    if (action) params.set('action', action);
    if (country) params.set('country', country);
    if (website) params.set('website', website);
    if (phone_number) params.set('phone_number', phone_number);

    const url = `${BASE}?${params.toString()}`;
    console.log('AutoFications call:', url.replace(KEY, 'HIDDEN'));

    const r = await fetch(url, { method: 'GET', cache: 'no-store' });
    const text = await r.text();

    // Handle known errors
    const trimmed = text.trim();
    const knownErrors = {
      Balance_error: 'AutoFications balance is low. Please top up your provider account.',
      Request_limited: 'Too many requests. Please wait 20 seconds.',
      Not_received: 'SMS not received yet. Please wait and try again.',
      Website_error: 'This service is not supported for this country.',
      Number_error: 'Phone number not linked to your request.',
      Number_zero: 'No numbers available right now. Try another service.'
    };

    if (knownErrors[trimmed]) {
      return res.status(200).json({ success: false, message: knownErrors[trimmed], code: trimmed });
    }

    // ---------- SERVICELIST ----------
    if (action === 'servicelist') {
      let services = [];
      try {
        const matches = trimmed.match(/\{[^{}]*\}/g) || [];
        services = matches.map(m => {
          try { return JSON.parse(m); } catch { return null; }
        }).filter(Boolean);
      } catch (e) {}

      services = services.map(s => ({
        id: String(s.id || ''),
        name: String(s.name || '').trim(),
        price: String(s.price || '0').replace('$', '')
      })).filter(s => s.id && s.name);

      return res.status(200).json({ success: true, services });
    }

    // ---------- GENERATE ----------
    if (action === 'generate') {
      const phone = trimmed;
      if (!phone || !/^\d+$/.test(phone)) {
        return res.status(200).json({ success: false, message: 'No number available. Try again.', debug: text });
      }
      return res.status(200).json({ success: true, number: phone });
    }

    // ---------- READ ----------
    if (action === 'read') {
      return res.status(200).json({ success: true, code: trimmed, found: trimmed.length > 0 });
    }

    // ---------- BALANCE ----------
    if (action === 'balance') {
      return res.status(200).json({ success: true, balance: parseFloat(trimmed) || 0 });
    }

    // ---------- BLACKLIST ----------
    if (action === 'blacklist') {
      return res.status(200).json({ success: trimmed.toLowerCase().includes('success') });
    }

    return res.status(200).json({ success: true, raw: trimmed });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
