"use strict";

function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parseAppUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error("CSY_DESKTOP_URL must be a valid absolute URL.");
    }

    const localHttp = url.protocol === "http:" && isLocalHost(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
        throw new Error("CSY_DESKTOP_URL must use HTTPS (HTTP is allowed only for localhost).");
    }
    if (url.username || url.password) {
        throw new Error("CSY_DESKTOP_URL must not contain credentials.");
    }
    return url;
}

function shouldOpenExternally(targetValue, appUrl) {
    let target;
    try {
        target = new URL(targetValue);
    } catch {
        return false;
    }
    if (target.protocol !== "https:") return false;
    return target.origin !== appUrl.origin;
}

function shouldAllowNavigation(targetValue, appUrl) {
    let target;
    try {
        target = new URL(targetValue);
    } catch {
        return false;
    }
    if (target.origin === appUrl.origin) return true;
    return appUrl.protocol === "http:" && isLocalHost(appUrl.hostname) &&
        target.protocol === "http:" && isLocalHost(target.hostname);
}

module.exports = { isLocalHost, parseAppUrl, shouldOpenExternally, shouldAllowNavigation };
