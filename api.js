"use strict";

/*
 * Shared API client for Card Stuff Yes frontend pages.
 *
 * Load runtime-config.js first, then this file, before page-specific scripts.
 * Credentialed cross-origin requests use the configured API origin. The
 * account deck builder uses GET/POST/PUT/DELETE; those endpoints depend on
 * the account backend changes being merged and deployed.
 */
(function () {
    const config = window.CSY_CONFIG || {};
    const configuredBase = String(config.apiBaseUrl || "").trim();
    let apiBaseUrl = "";

    if (configuredBase) {
        let parsed;
        try {
            parsed = new URL(configuredBase);
        } catch {
            throw new Error("Card Stuff Yes API origin is not a valid URL.");
        }

        const localHttp = parsed.protocol === "http:" &&
            (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
        if ((parsed.protocol !== "https:" && !localHttp) ||
            parsed.username || parsed.password ||
            parsed.pathname !== "/" || parsed.search || parsed.hash) {
            throw new Error("Card Stuff Yes API origin must be an HTTPS origin (HTTP is allowed only for localhost).");
        }
        apiBaseUrl = parsed.origin;
    }

    async function request(path, options = {}) {
        if (!apiBaseUrl) {
            throw new Error("Card Stuff Yes API is not configured for this host.");
        }
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
            throw new TypeError("API paths must be root-relative paths beginning with one slash.");
        }

        const method = String(options.method || "GET").toUpperCase();
        if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
            throw new TypeError("Unsupported Card Stuff Yes API method.");
        }

        const headers = new Headers(options.headers || {});
        const init = {
            ...options,
            method,
            headers,
            credentials: "include",
            cache: "no-store"
        };

        if (init.body && typeof init.body !== "string" && !(init.body instanceof FormData)) {
            headers.set("Content-Type", "application/json");
            init.body = JSON.stringify(init.body);
        }

        const response = await fetch(apiBaseUrl + path, init);
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
            ? await response.json().catch(() => ({}))
            : await response.text();

        if (!response.ok) {
            const message = data && typeof data === "object" && data.error
                ? data.error
                : "API request failed (" + response.status + ").";
            const error = new Error(message);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    window.CSY_API = Object.freeze({
        request,
        get: path => request(path, { method: "GET" }),
        post: (path, body) => request(path, { method: "POST", body }),
        put: (path, body) => request(path, { method: "PUT", body }),
        delete: path => request(path, { method: "DELETE" })
    });
})();
