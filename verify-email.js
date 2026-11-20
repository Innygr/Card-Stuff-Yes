"use strict";
const API_BASE = window.CSY_CONFIG?.apiBaseUrl || "";
const heading = document.getElementById("verify-heading");
const status = document.getElementById("verify-status");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
// Remove the bearer token from browser history/address bar before making requests.
window.history.replaceState({}, document.title, window.location.pathname);
(async function verify() {
    if (!/^[a-f0-9]{64}$/.test(token)) {
        heading.textContent = "Verification link unavailable";
        status.textContent = "This link is invalid or incomplete. Sign in and request another verification email.";
        status.classList.add("error");
        return;
    }
    try {
        const response = await fetch(API_BASE + "/api/account/email/verify", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not verify this email address.");
        heading.textContent = "Email verified";
        status.textContent = data.message || "Your email address has been verified.";
        status.classList.add("success");
    } catch (error) {
        heading.textContent = "Verification unsuccessful";
        status.textContent = error.message;
        status.classList.add("error");
    }
})();
