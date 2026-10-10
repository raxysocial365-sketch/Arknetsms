/* =========================================================
   api/textverified-buy.js
   Arknet SMS — TextVerified USA Numbers Proxy
   Based on FameSMS implementation
========================================================= */

const TV_BASE = "https://www.textverified.com";
const TV_AUTH = `${TV_BASE}/api/pub/v2/auth`;
const TV_SERVICES = `${TV_BASE}/api/pub/v2/services`;
const TV_CREATE = `${TV_BASE}/api/pub/v2/verifications`;
const TV_PRICING = `${TV_BASE}/api/pub/v2/pricing/verifications`;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
        return cachedToken;
    }

    const username = process.env.TEXTVERIFIED_USERNAME;
    const apiKey = process.env.TEXTVERIFIED_API_KEY;

    if (!username || !apiKey) {
        throw new Error("TextVerified credentials missing. Set TEXTVERIFIED_USERNAME and TEXTVERIFIED_API_KEY in Vercel.");
    }

    const res = await fetch(TV_AUTH, {
        method: "POST",
        headers: {
            "X-API-USERNAME": username,
            "X-API-KEY": apiKey
        }
    });

    const text = await res.text();
    let data = {};

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (!res.ok || !data.token) {
        console.error("TextVerified auth failed:", data);
        throw new Error(
            data.message || data.error || "TextVerified authentication failed"
        );
    }

    cachedToken = data.token;
    tokenExpiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;

    return cachedToken;
}

async function listServices() {
    const token = await getToken();

    const res = await fetch(
        `${TV_SERVICES}?numberType=mobile&reservationType=verification`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        }
    );

    const text = await res.text();
    let data = {};

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (!res.ok) {
        console.error("TextVerified services error:", data);
        throw new Error(
            data.message || data.error || "Failed to load TextVerified services"
        );
    }

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

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (!res.ok) {
        return {
            ok: false,
            error:
                data.message || data.error || text || "Unable to fetch price"
        };
    }

    return { ok: true, data };
}

async function createVerification(serviceName, maxPrice) {
    const token = await getToken();

    const body = {
        serviceName: serviceName,
        capability: "sms",
        numberType: "mobile",
        carrier: false,
        areaCode: false
    };

    if (maxPrice && Number(maxPrice) > 0) {
        body.maxPrice = Number(maxPrice);
    }

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

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (res.status !== 201) {
        console.error("TextVerified create error:", data);
        throw new Error(
            data.message || data.error || "Could not create verification"
        );
    }

    return data;
}

async function getVerification(id) {
    const token = await getToken();

    const res = await fetch(
        `${TV_BASE}/api/pub/v2/verifications/${encodeURIComponent(id)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        }
    );

    const text = await res.text();
    let data = {};

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (!res.ok) {
        console.error("TextVerified verification error:", data);
        throw new Error(
            data.message || data.error || "Could not load verification"
        );
    }

    return data;
}

async function cancelVerification(id) {
    const token = await getToken();

    const res = await fetch(
        `${TV_BASE}/api/pub/v2/verifications/${encodeURIComponent(id)}/cancel`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        }
    );

    const text = await res.text();
    let data = {};

    try {
        data = JSON.parse(text);
    } catch {
        data = {};
    }

    if (!res.ok) {
        throw new Error(
            data.message || data.error || "Could not cancel verification"
        );
    }

    return { success: true, data };
}

async function listSms(verificationId) {
    const token = await getToken();

    let details;

    try {
        details = await getVerification(verificationId);
    } catch (err) {
        console.warn("getVerification failed:", err.message);
        return { sms: [], raw: err.message };
    }

    const smsUrl =
        details?.sms?.href ||
        `${TV_BASE}/api/pub/v2/sms?ReservationId=${encodeURIComponent(verificationId)}`;

    try {
        const res = await fetch(smsUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        });

        const text = await res.text();
        let data = {};

        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        if (!res.ok) {
            console.warn("SMS endpoint failed:", res.status, data);
            return { sms: [], raw: data };
        }

        return data;
    } catch (err) {
        console.warn("listSms fetch error:", err.message);
        return { sms: [], raw: err.message };
    }
}

function collectMessageObjects(value, output = [], depth = 0) {
    if (value === null || value === undefined || depth > 6) {
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectMessageObjects(item, output, depth + 1);
        }
        return output;
    }

    if (typeof value !== "object") {
        return output;
    }

    const keys = Object.keys(value).map((k) => k.toLowerCase());

    const looksLikeMessage =
        keys.includes("text") ||
        keys.includes("body") ||
        keys.includes("message") ||
        keys.includes("content") ||
        keys.includes("smstext") ||
        keys.includes("sms") ||
        keys.includes("msg") ||
        keys.includes("lastmessage") ||
        keys.includes("verificationmessage") ||
        keys.includes("messagetext") ||
        keys.includes("inboundmessage") ||
        keys.includes("fullmessage") ||
        keys.includes("smscontent") ||
        keys.includes("parsedcode");

    if (looksLikeMessage) {
        output.push(value);
    }

    for (const child of Object.values(value)) {
        collectMessageObjects(child, output, depth + 1);
    }

    return output;
}

function extractMessageText(message) {
    if (message === null || message === undefined) return "";
    if (typeof message === "string") return message;
    if (typeof message !== "object") return "";

    const possibleFields = [
        "text",
        "body",
        "message",
        "content",
        "smsText",
        "sms",
        "messageText",
        "description",
        "msg",
        "lastMessage",
        "verificationMessage",
        "inboundMessage",
        "fullMessage",
        "smsContent"
    ];

    for (const field of possibleFields) {
        const value = message[field];

        if (typeof value === "string" && value.trim()) {
            return value;
        }

        if (Array.isArray(value)) {
            const joined = value
                .filter((v) => typeof v === "string")
                .join(" ");
            if (joined.trim()) return joined;
        }
    }

    return "";
}

function extractSmsCode(smsData) {
    if (!smsData) return null;

    const directCodeKeys = [
        "parsedcode",
        "code",
        "smscode",
        "verificationcode",
        "otp",
        "passcode"
    ];

    function findDirectCode(value, depth = 0) {
        if (depth > 6 || value === null || value === undefined) return null;
        if (typeof value !== "object") return null;

        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findDirectCode(item, depth + 1);
                if (found) return found;
            }
            return null;
        }

        for (const [key, child] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase();

            if (directCodeKeys.includes(normalizedKey)) {
                const str = String(child ?? "").trim();
                const cleaned = str.replace(/[-\s]/g, "");
                const match = cleaned.match(/^\d{4,8}$/);
                if (match) {
                    return { code: match[0], text: str };
                }
            }

            const nested = findDirectCode(child, depth + 1);
            if (nested) return nested;
        }

        return null;
    }

    const direct = findDirectCode(smsData);
    if (direct) return direct;

    const messages = collectMessageObjects(smsData);

    if (Array.isArray(smsData)) {
        messages.push(...smsData);
    }

    const uniqueMessages = Array.from(new Set(messages));

    for (const message of uniqueMessages) {
        const text = extractMessageText(message);
        if (!text) continue;

        const matches = text.match(/\b\d{3,4}[-\s]?\d{2,4}\b/g);

        if (matches && matches.length) {
            for (const match of matches) {
                const cleaned = match.replace(/[-\s]/g, "");
                if (/^\d{4,8}$/.test(cleaned)) {
                    return { code: cleaned, text: text };
                }
            }
        }
    }

    return null;
}

function extractPrice(data) {
    const p = data || {};

    return Number(
        p.price ??
            p.cost ??
            p.priceUSD ??
            p.totalCost ??
            p.amount ??
            0
    );
}

function send(res, status, data) {
    return res.status(status).json(data);
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        let body = {};

        if (req.method === "POST") {
            body =
                typeof req.body === "string"
                    ? JSON.parse(req.body || "{}")
                    : req.body || {};
        }

        const input = { ...req.query, ...body };
        const action = String(input.action || "").trim();

        if (!action) {
            return send(res, 400, {
                success: false,
                error: "Missing action."
            });
        }

        if (action === "auth") {
            const token = await getToken();
            return send(res, 200, {
                success: true,
                tokenPreview: token.substring(0, 20) + "..."
            });
        }

        if (action === "servicelist") {
            const services = await listServices();
            const normalized = services.map((service) => ({
                name: service.serviceName || service.name || "",
                description:
                    service.description ||
                    service.serviceName ||
                    service.name ||
                    "",
                capability: service.capability || "sms",
                id: service.serviceName || service.name || "",
                price: extractPrice(service)
            }));

            return send(res, 200, {
                success: true,
                services: normalized
            });
        }

        if (action === "price") {
            const serviceName = String(input.service || "").trim();
            if (!serviceName) {
                return send(res, 400, {
                    success: false,
                    error: "Missing service."
                });
            }

            const result = await getPriceForService(serviceName);

            if (!result.ok) {
                return send(res, 200, {
                    success: false,
                    error: result.error
                });
            }

            return send(res, 200, {
                success: true,
                service: serviceName,
                priceUSD: extractPrice(result.data),
                raw: result.data
            });
        }

        if (action === "batchprice" || action === "batchfetch") {
            const listRaw = String(input.services || "").trim();
            if (!listRaw) {
                return send(res, 400, {
                    success: false,
                    error: "Missing services."
                });
            }

            const names = listRaw
                .split(",")
                .map((n) => n.trim())
                .filter(Boolean)
                .slice(0, 50);

            const results = {};

            for (const name of names) {
                try {
                    const result = await getPriceForService(name);
                    if (result.ok) {
                        results[name] = {
                            ok: true,
                            priceUSD: extractPrice(result.data)
                        };
                    } else {
                        results[name] = {
                            ok: false,
                            error: result.error
                        };
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

            if (!serviceName) {
                return send(res, 400, {
                    success: false,
                    error: "Missing service."
                });
            }

            const created = await createVerification(serviceName, maxPrice);

            const href = created.href || created.url || "";
            let id = "";

            if (href) {
                id = href.split("/").filter(Boolean).pop();
            }

            if (!id) {
                id = created.id || created.verificationId || "";
            }

            if (!id) {
                console.error("No verification ID:", created);
                return send(res, 500, {
                    success: false,
                    error: "No verification ID returned"
                });
            }

            const details = await getVerification(id);

            return send(res, 200, {
                success: true,
                id: id,
                request_id: id,
                number:
                    details.number ||
                    details.phone ||
                    details.phoneNumber ||
                    "",
                serviceName: details.serviceName || serviceName,
                state: details.state || details.status || "waiting",
                totalCost: details.totalCost ?? details.cost ?? 0
            });
        }

        if (action === "read") {
            const id = String(input.id || input.request_id || "").trim();

            if (!id) {
                return send(res, 400, {
                    success: false,
                    error: "Missing id."
                });
            }

            const details = await getVerification(id);
            const smsData = await listSms(id);

            let found = extractSmsCode(smsData);
            let finalCode = found?.code || null;

            if (!finalCode) {
                found = extractSmsCode(details);
                finalCode = found?.code || null;
            }

            const rawState = String(details.state || details.status || "");
            const stateNorm = rawState.toLowerCase().replace(/[\s_-]/g, "");

            let state = "waiting";

            if (finalCode) {
                state = "completed";
            } else if (
                stateNorm.includes("verificationcanceled") ||
                stateNorm.includes("verificationcancelled")
            ) {
                state = "cancelled";
            } else if (stateNorm.includes("verificationtimedout")) {
                state = "expired";
            }

            return send(res, 200, {
                success: true,
                state: state,
                providerState: rawState,
                number:
                    details.number ||
                    details.phone ||
                    details.phoneNumber ||
                    "",
                received: Boolean(finalCode),
                code: finalCode
            });
        }

        if (action === "cancel") {
            const id = String(input.id || input.request_id || "").trim();
            if (!id) {
                return send(res, 400, {
                    success: false,
                    error: "Missing id."
                });
            }

            await cancelVerification(id);

            return send(res, 200, {
                success: true,
                message: "Cancelled"
            });
        }

        return send(res, 400, {
            success: false,
            error: `Unknown action: ${action}`
        });
    } catch (error) {
        console.error("Arknet usa-numbers error:", error);

        return send(res, 500, {
            success: false,
            error: error.message || "Request failed"
        });
    }
              }
