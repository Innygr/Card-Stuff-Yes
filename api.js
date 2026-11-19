"use strict";

/*
 * Shared API client for Card Stuff Yes frontend pages.
 *
 * Load runtime-config.js first, then this file, before page-specific scripts.
 * All requests include cookies for guest/account session continuity. The
 * backend must separately allow the exact frontend origin with credentialed
 * CORS; this client does not weaken or bypass browser security controls.
 */
(function () {
    const config = window.CSY_CONFIG || {};
    const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/+$/, "");

    async function request(path, options = {}) {
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
            throw new TypeError("API paths must be root-relative paths beginning with one slash.");
        }

        const headers = new Headers(options.headers || {});
        const init = {
            ...options,
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
        patch: (path, body) => request(path, { method: "PATCH", body }),
        delete: path => request(path, { method: "DELETE" })
    });
})();
