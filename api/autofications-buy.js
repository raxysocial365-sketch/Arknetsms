// api/autofications-buy.js
// AutoFications API proxy — Arknet SMS

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, country, website, phone_number } = req.query;

  const USERNAME = process.env.AUTOFICATIONS_USERNAME;
  const KEY = process.env.AUTOFICATIONS_API_KEY;

  // AutoFications base endpoint (their actual API domain)
  const BASE = process.env.AUTOFICATIONS_BASE_URL || 'https://autofications.com/api';

  if (!USERNAME || !KEY) {
    return res.status(500).json({
      success: false,
      message: 'API credentials not configured. Set AUTOFICATIONS_USERNAME and AUTOFICATIONS_API_KEY in Vercel.'
    });
  }

  try {
    // ---- Build query string to AutoFications ----
    const params = new URLSearchParams();
    params.set('username', USERNAME);
    params.set('key', KEY);

    if (action) params.set('action', action);
    if (country) params.set('country', country);
    if (website) params.set('website', website);
    if (phone_number) params.set('phone_number', phone_number);

    const url = `${BASE}?${params.toString()}`;

    const r = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });

    const text = await r.text();

    // Try to parse as JSON, else return raw text
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // If AutoFications returned an error code as plain text
    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        message: data?.raw || data?.message || `AutoFications returned ${r.status}`
      });
    }

    // Handle known AutoFications error strings
    const rawText = (data?.raw || '').trim();
    const knownErrors = [
      'Balance_error', 'Request_limited', 'Not_received',
      'Website_error', 'Number_error', 'Number_zero'
    ];

    if (knownErrors.includes(rawText)) {
      const friendly = {
        Balance_error: 'AutoFications balance is low. Please top up your provider account.',
        Request_limited: 'Too many requests. Please wait 20 seconds.',
        Not_received: 'SMS not received yet. Please wait and try again.',
        Website_error: 'This service is not supported for this country.',
        Number_error: 'Phone number not linked to your request.',
        Number_zero: 'No numbers available right now. Try another service.'
      };
      return res.status(200).json({
        success: false,
        message: friendly[rawText] || rawText,
        code: rawText
      });
    }

    // ---- Handle each action type ----

    // SERVICELIST — AutoFications returns concatenated JSON objects
    // Example: {"name":"Adidas","id":"1127","price":"$2"}{"name":"Protonmail",...}
    if (action === 'servicelist') {
      let services = [];

      if (Array.isArray(data)) {
        services = data;
      } else if (Array.isArray(data?.services)) {
        services = data.services;
      } else if (rawText) {
        // Parse concatenated JSON objects: {...}{...}{...}
        const matches = rawText.match(/\{[^{}]*\}/g) || [];
        services = matches.map(m => {
          try { return JSON.parse(m); } catch { return null; }
        }).filter(Boolean);
      }

      // Normalize
      services = services.map(s => ({
        id: String(s.id || ''),
        name: String(s.name || '').trim(),
        price: String(s.price || '0').replace('$', '')
      })).filter(s => s.id && s.name);

      return res.status(200).json({ success: true, services });
    }

    // GENERATE — returns plain phone number
    // Example: 447107315173
    if (action === 'generate') {
      const phone = rawText || data?.number || data?.phone || '';
      if (!phone || !/^\d+$/.test(phone.trim())) {
        return res.status(200).json({
          success: false,
          message: 'No number available right now. Try again or pick another service.',
          debug: rawText
        });
      }
      return res.status(200).json({ success: true, number: phone.trim() });
    }

    // READ — returns SMS code text
    // Example: G-885839 is your Google verification code.
    if (action === 'read') {
      return res.status(200).json({
        success: true,
        code: rawText || '',
        found: rawText.length > 0
      });
    }

    // BLACKLIST
    if (action === 'blacklist') {
      return res.status(200).json({ success: rawText.toLowerCase().includes('success'), raw: rawText });
    }

    // BALANCE
    if (action === 'balance') {
      return res.status(200).json({ success: true, balance: parseFloat(rawText) || 0 });
    }

    // Default — return raw
    return res.status(200).json({ success: true, raw: rawText, data });

  } catch (err) {
    console.error('AutoFications proxy error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error'
    });
  }
}
