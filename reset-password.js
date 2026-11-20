"use strict";
const API_BASE = window.CSY_CONFIG?.apiBaseUrl || "";
const form = document.getElementById("reset-form");
const status = document.getElementById("reset-status");
const heading = document.getElementById("reset-heading");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
window.history.replaceState({}, document.title, window.location.pathname);
if (!/^[a-f0-9]{64}$/.test(token)) {
    form.hidden = true;
    heading.textContent = "Reset link unavailable";
    status.textContent = "This link is invalid or incomplete. Request a new password reset email.";
    status.classList.add("error");
}
form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("new-password").value;
    const confirmation = document.getElementById("confirm-password").value;
    if (password !== confirmation) {
        status.textContent = "Passwords do not match.";
        status.className = "status error";
        return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.textContent = "Updating your password…";
    status.className = "status";
    try {
        const response = await fetch(API_BASE + "/api/auth/password-reset/complete", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not reset your password.");
        form.hidden = true;
        heading.textContent = "Password updated";
        status.textContent = data.message || "Your password has been reset. You can now sign in.";
        status.className = "status success";
    } catch (error) {
        status.textContent = error.message;
        status.className = "status error";
    } finally {
        button.disabled = false;
    }
});
