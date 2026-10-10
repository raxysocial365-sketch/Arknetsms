/* ============================================================
   api/textverified-buy.js
   Arknet SMS — TextVerified USA API
============================================================ */

const TV_BASE = "https://www.textverified.com";
const TV_AUTH = `${TV_BASE}/api/pub/v2/auth`;
const TV_SERVICES = `${TV_BASE}/api/pub/v2/services`;
const TV_CREATE = `${TV_BASE}/api/pub/v2/verifications`;
const TV_PRICING = `${TV_BASE}/api/pub/v2/pricing/verifications`;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

    const username = process.env.TEXTVERIFIED_USERNAME;
    const apiKey = process.env.TEXTVERIFIED_API_KEY;
    if (!username || !apiKey) throw new Error("TextVerified credentials missing.");

    const res = await fetch(TV_AUTH, {
        method: "POST",
        headers: { "X-API-USERNAME": username, "X-API-KEY": apiKey }
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    if (!res.ok || !data.token) {
        throw new Error(data.message || data.error || "TextVerified authentication failed");
    }
    cachedToken = data.token;
    tokenExpiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;
    return cachedToken;
}

async function listServices() {
    const token = await getToken();
    const res = await fetch(
        `${TV_SERVICES}?numberType=mobile&reservationType=verification`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    if (!res.ok) throw new Error(data.message || data.error || "Failed to load services");

    if (Array.isArray(data)) return data;
    if (Array.isArray(data.services)) return data.services;
    if (Array.isArray(data.data)) return data.data;
    return [];
}

async function getPriceForService(serviceName) {
    const token = await getToken();
    const res = await fetch(TV_PRICING, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            serviceName: serviceName,
            capability: "sms",
            numberType: "mobile",
            carrier: false,
            areaCode: false
        })
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    if (!res.ok) {
        return { ok: false, error: data.message || data.error || "Unable to fetch price" };
    }
    return { ok: true, data };
}

async function createVerification(serviceName, maxPrice) {
    const token = await getToken();
    const body = { serviceName, capability: "sms", numberType: "mobile", carrier: false, areaCode: false };
    if (maxPrice && Number(maxPrice) > 0) body.maxPrice = Number(maxPrice);

    const res = await fetch(TV_CREATE, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    if (res.status !== 201) {
        throw new Error(data.message || data.error || "Number out of stock. Please try again later.");
    }
    return data;
}

async function getVerification(id) {
    const token = await getToken();
    const res = await fetch(
        `${TV_BASE}/api/pub/v2/verifications/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!res.ok) throw new Error(data.message || data.error || "Could not load verification");
    return data;
}

async function cancelVerification(id) {
    const token = await getToken();
    const res = await fetch(
        `${TV_BASE}/api/pub/v2/verifications/${encodeURIComponent(id)}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!res.ok) throw new Error(data.message || data.error || "Could not cancel");
    return { success: true, data };
}

function extractPrice(data) {
    const p = data || {};
    return Number(p.price ?? p.cost ?? p.priceUSD ?? p.totalCost ?? p.amount ?? p.rate ?? 0);
}

function send(res, status, data) { return res.status(status).json(data); }

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        let body = {};
        if (req.method === "POST") {
            body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        }
        const input = { ...req.query, ...body };
        const action = String(input.action || "").trim();

        if (!action) return send(res, 400, { success: false, error: "Missing action." });

        if (action === "servicelist") {
            const services = await listServices();
            const normalized = services.map(s => ({
                name: s.serviceName || s.name || "",
                description: s.description || s.serviceName || s.name || "",
                id: s.serviceName || s.name || "",
                priceUSD: extractPrice(s)
            })).filter(s => s.id && s.name);

            return send(res, 200, { success: true, services: normalized });
        }

        if (action === "price") {
            const serviceName = String(input.service || "").trim();
            if (!serviceName) return send(res, 400, { success: false, error: "Missing service." });

            const result = await getPriceForService(serviceName);
            if (!result.ok) return send(res, 200, { success: false, error: result.error });

            return send(res, 200, {
                success: true,
                service: serviceName,
                priceUSD: extractPrice(result.data),
                raw: result.data
            });
        }

        if (action === "batchprice") {
            const listRaw = String(input.services || "").trim();
            if (!listRaw) return send(res, 400, { success: false, error: "Missing services." });

            const names = listRaw.split(",").map(n => n.trim()).filter(Boolean).slice(0, 80);
            const results = {};

            for (const name of names) {
                try {
                    const result = await getPriceForService(name);
                    if (result.ok) {
                        results[name] = { ok: true, priceUSD: extractPrice(result.data) };
                    } else {
                        results[name] = { ok: false, error: result.error };
                    }
                } catch (err) {
                    results[name] = { ok: false, error: err.message };
                }
            }
            return send(res, 200, { success: true, results });
        }

        if (action === "generate") {
            const serviceName = String(input.service || "").trim();
            const maxPrice = Number(input.maxPrice || 0);
            if (!serviceName) return send(res, 400, { success: false, error: "Missing service." });

            const created = await createVerification(serviceName, maxPrice);
            const href = created.href || created.url || "";
            let id = "";
            if (href) id = href.split("/").filter(Boolean).pop();
            if (!id) id = created.id || created.verificationId || "";
            if (!id) return send(res, 500, { success: false, error: "No verification ID returned" });

            const details = await getVerification(id);

            return send(res, 200, {
                success: true,
                id: id,
                request_id: id,
                number: details.number || details.phone || details.phoneNumber || "",
                serviceName: details.serviceName || serviceName,
                state: details.state || details.status || "waiting",
                totalCost: details.totalCost ?? details.cost ?? 0
            });
        }

        if (action === "cancel") {
            const id = String(input.id || input.request_id || "").trim();
            if (!id) return send(res, 400, { success: false, error: "Missing id." });
            await cancelVerification(id);
            return send(res, 200, { success: true, message: "Cancelled" });
        }

        return send(res, 400, { success: false, error: `Unknown action: ${action}` });
    } catch (error) {
        console.error("Arknet usa-numbers error:", error);
        return send(res, 500, { success: false, error: error.message || "Request failed" });
    }
}
