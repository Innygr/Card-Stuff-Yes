"use strict";
const API_BASE = window.CSY_CONFIG?.apiBaseUrl || "";
const requestForm = document.getElementById("request-form");
const resetForm = document.getElementById("reset-form");
const status = document.getElementById("reset-status");
const heading = document.getElementById("reset-heading");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
window.history.replaceState({}, document.title, window.location.pathname);

function showStatus(message, type = "") {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
}

if (/^[a-f0-9]{64}$/.test(token)) {
    requestForm.hidden = true;
    resetForm.hidden = false;
} else if (token) {
    requestForm.hidden = true;
    resetForm.hidden = true;
    heading.textContent = "Reset link unavailable";
    showStatus("This link is invalid or incomplete. Request a new password reset email.", "error");
} else {
    resetForm.hidden = true;
    requestForm.hidden = false;
    heading.textContent = "Request a password reset";
}

requestForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = requestForm.querySelector("button[type=submit]");
    button.disabled = true;
    showStatus("Submitting request…");
    try {
        const response = await fetch(API_BASE + "/api/auth/password-reset/request", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: document.getElementById("reset-email").value.trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not submit the request.");
        requestForm.hidden = true;
        showStatus(data.message || "If an account matches that address, a reset link will be sent.", "success");
    } catch (error) {
        showStatus(error.message, "error");
    } finally {
        button.disabled = false;
    }
});

resetForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("new-password").value;
    const confirmation = document.getElementById("confirm-password").value;
    if (password !== confirmation) {
        showStatus("Passwords do not match.", "error");
        return;
    }
    const button = resetForm.querySelector("button[type=submit]");
    button.disabled = true;
    showStatus("Updating your password…");
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
        resetForm.hidden = true;
        heading.textContent = "Password updated";
        showStatus(data.message || "Your password has been reset. You can now sign in.", "success");
    } catch (error) {
        showStatus(error.message, "error");
    } finally {
        button.disabled = false;
    }
});
