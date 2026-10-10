// api/autofications-buy.js
// Arknet SMS → AutoFications API Proxy

const BASE_URL = "https://autofications.com/V2/API.php";

/* =========================================================
   AutoFications Country ID Mapping
========================================================= */

const COUNTRY_MAP = {
    gb: "UK",
    uk: "UK",
    us: "US1",
    usa: "US1",
    us1: "US1",
    fr: "FR",
    hk: "HK",
    cn: "CN",
    de: "DE",
    nl: "NL",
    my: "MY",
    br: "BR",
    ind: "IND",
    in: "IND",
    ph: "PH",
    es: "ES",
    ar: "AR",
    nz: "NZ",
    ua: "UA",
    se: "SE",
    pl: "PL",
    in1: "IN1",
    vn: "VN",
    ro: "RO",
    pt: "PT",
    tr: "TR",
    ee: "EE",
    il: "IL",
    mx: "MX",
    lv: "LV",
    ma: "MA",
    th: "TH",
    ie: "IE",
    fi: "FI",
    py: "PY",
    za: "ZA",
    lt: "LT",
    gr: "GR",
    it: "IT",
    kh: "KH",
    ke: "KE",
    cz: "CZ",
    ng: "NG",
    at: "AT",
    co: "CO",
    ge: "GE",
    sa: "SA",
    mo: "MO",
    hr: "HR",
    ao: "AO",
    kz: "KZ",
    dk: "DK",
    kg: "KG",
    pk: "PK",
    mz: "MZ",
    do1: "DO1",
    ba: "BA",
    ls: "LS",
    tl: "TL",
    az: "AZ",
    us2: "US2",
    ca: "CA"
};

function normalizeCountry(country) {
    const value = String(country || "").trim();
    if (!value) return "";
    const lower = value.toLowerCase();
    if (Object.values(COUNTRY_MAP).includes(value.toUpperCase())) {
        return value.toUpperCase();
    }
    return COUNTRY_MAP[lower] || value.toUpperCase();
}

/* =========================================================
   Configuration
========================================================= */

function getConfig() {
    const username = process.env.AUTOFICATIONS_USERNAME;
    const key = process.env.AUTOFICATIONS_API_KEY;
    if (!username || !key) {
        throw new Error("Autofications credentials are not configured in Vercel.");
    }
    return { username, key };
}

/* =========================================================
   Call AutoFications
========================================================= */

async function callAutofications(params) {
    const { username, key } = getConfig();
    const query = new URLSearchParams({ username, key, ...params });
    const url = `${BASE_URL}?${query.toString()}`;

    console.log("AutoFications request:", {
        action: params.action,
        country: params.country,
        website: params.website
    });

    const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/plain, application/json" }
    });

    const text = await response.text();

    console.log("AutoFications response:", text);

    if (!response.ok) {
        throw new Error(`Autofications HTTP ${response.status}`);
    }

    return text.trim();
}

function send(res, status, data) {
    return res.status(status).json(data);
}

/* =========================================================
   Parse Service List
========================================================= */

function parseServiceList(text) {
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.services)) return parsed.services;
            if (Array.isArray(parsed.data)) return parsed.data;
            return [parsed];
        }
    } catch (_) {}

    const results = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') { inString = true; continue; }

        if (char === "{") {
            if (depth === 0) start = i;
            depth++;
        }

        if (char === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
                const piece = text.slice(start, i + 1);
                try { results.push(JSON.parse(piece)); } catch (_) {}
                start = -1;
            }
        }
    }

    return results;
}

function normalizePrice(value) {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return null;
    const match = value.replace(/,/g, "").match(/[\d.]+/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
}

/* =========================================================
   AutoFications Errors
========================================================= */

function errorFromAutofications(text) {
    const value = String(text || "");
    const known = [
        "Balance_error",
        "Request_limited",
        "Not_received",
        "Website_error",
        "Number_error",
        "Number_zero"
    ];
    const found = known.find(code => value.includes(code));
    if (!found) return null;

    const messages = {
        Balance_error: "Autofications balance is not enough for this verification.",
        Request_limited: "Please wait at least 20 seconds before requesting the SMS again.",
        Not_received: "The SMS has not been received yet.",
        Website_error: "This service is not supported by Autofications.",
        Number_error: "This phone number is not associated with the request.",
        Number_zero: "There are currently no numbers available for this service and country."
    };

    return { code: found, message: messages[found] || found };
}

/* =========================================================
   EXTRACT SMS CODE (handles 123-456)
========================================================= */

function extractSmsCode(text) {
    if (!text) return null;
    const str = String(text).trim();

    const ignoreList = [
        "not_received", "number_error", "website_error",
        "balance_error", "request_limited", "number_zero"
    ];

    if (ignoreList.some(item => str.toLowerCase().includes(item))) return null;

    const dashedMatches = str.match(/\b\d{3,4}[-\s]\d{2,4}\b/g);
    if (dashedMatches && dashedMatches.length) {
        const cleaned = dashedMatches[0].replace(/[-\s]/g, "");
        if (/^\d{4,8}$/.test(cleaned)) return cleaned;
    }

    const matches = str.match(/\b\d{4,8}\b/g);
    if (matches && matches.length) return matches[0];

    return null;
}

/* =========================================================
   Main API Handler
========================================================= */

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "GET" && req.method !== "POST") {
        return send(res, 405, { success: false, error: "Method not allowed" });
    }

    try {
        let body = {};
        if (req.method === "POST") {
            body = typeof req.body === "string"
                ? JSON.parse(req.body || "{}")
                : req.body || {};
        }

        const input = { ...req.query, ...body };
        const action = String(input.action || "").trim();

        if (!action) {
            return send(res, 400, { success: false, error: "Missing action." });
        }

        /* SERVICE LIST */
        if (action === "servicelist") {
            const originalCountry = String(input.country || "").trim();
            if (!originalCountry) {
                return send(res, 400, { success: false, error: "Missing country." });
            }

            const country = normalizeCountry(originalCountry);
            console.log(`Service list: ${originalCountry} → ${country}`);

            const raw = await callAutofications({ action: "servicelist", country });
            const apiError = errorFromAutofications(raw);

            if (apiError) {
                return send(res, 400, {
                    success: false,
                    error: apiError.message,
                    code: apiError.code,
                    country
                });
            }

            const parsed = parseServiceList(raw);

            const services = parsed
                .map(service => {
                    const name = String(service?.name || "").trim();
                    const id = String(service?.id || "").trim();
                    const price = normalizePrice(service?.price);
                    return {
                        name,
                        id,
                        price,
                        priceText: String(service?.price || "").trim()
                    };
                })
                .filter(service => service.name && service.id && service.price !== null);

            return send(res, 200, {
                success: true,
                requestedCountry: originalCountry,
                autoficationsCountry: country,
                services
            });
        }

        /* GENERATE */
        if (action === "generate") {
            const originalCountry = String(input.country || "").trim();
            const website = String(input.website || "").trim();

            if (!originalCountry || !website) {
                return send(res, 400, {
                    success: false,
                    error: "Country and website are required."
                });
            }

            const country = normalizeCountry(originalCountry);
            const raw = await callAutofications({ action: "generate", country, website });
            const apiError = errorFromAutofications(raw);

            if (apiError) {
                return send(res, 400, {
                    success: false,
                    error: apiError.message,
                    code: apiError.code
                });
            }

            const number = String(raw || "").replace(/["\s]/g, "");
            if (!number || number.toLowerCase().includes("error")) {
                return send(res, 400, {
                    success: false,
                    error: raw || "Unable to generate number."
                });
            }

            return send(res, 200, { success: true, number, country, website });
        }

        /* READ SMS */
        if (action === "read") {
            const originalCountry = String(input.country || "").trim();
            const website = String(input.website || "").trim();
            const phoneNumber = String(input.phone_number || "").trim();

            if (!originalCountry || !website || !phoneNumber) {
                return send(res, 400, {
                    success: false,
                    error: "Country, website and phone_number are required."
                });
            }

            const country = normalizeCountry(originalCountry);
            const raw = await callAutofications({
                action: "read", country, website, phone_number: phoneNumber
            });

            const apiError = errorFromAutofications(raw);
            if (apiError) {
                return send(res, 200, {
                    success: false, received: false,
                    error: apiError.message, code: apiError.code
                });
            }

            const extractedCode = extractSmsCode(raw);
            return send(res, 200, {
                success: true,
                received: Boolean(extractedCode),
                message: raw || null,
                code: extractedCode
            });
        }

        /* BLACKLIST */
        if (action === "blacklist") {
            const originalCountry = String(input.country || "").trim();
            const website = String(input.website || "").trim();
            const phoneNumber = String(input.phone_number || "").trim();

            if (!originalCountry || !website || !phoneNumber) {
                return send(res, 400, {
                    success: false,
                    error: "Country, website and phone_number are required."
                });
            }

            const country = normalizeCountry(originalCountry);
            const raw = await callAutofications({
                action: "blacklist", country, website, phone_number: phoneNumber
            });
            const apiError = errorFromAutofications(raw);

            if (apiError) {
                return send(res, 400, {
                    success: false, error: apiError.message, code: apiError.code
                });
            }

            return send(res, 200, { success: true, message: raw || "Success" });
        }

        /* BALANCE */
        if (action === "balance") {
            const raw = await callAutofications({ action: "balance" });
            const apiError = errorFromAutofications(raw);

            if (apiError) {
                return send(res, 400, {
                    success: false, error: apiError.message, code: apiError.code
                });
            }

            const balance = Number(String(raw).replace(/[^0-9.-]/g, ""));
            return send(res, 200, {
                success: true,
                balance: Number.isFinite(balance) ? balance : 0,
                raw
            });
        }

        return send(res, 400, {
            success: false,
            error: `Unknown action: ${action}`
        });

    } catch (error) {
        console.error("Autofications API error:", error);
        return send(res, 500, {
            success: false,
            error: error?.message || "Autofications request failed."
        });
    }
}
