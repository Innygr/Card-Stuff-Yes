"use strict";

const API_BASE = window.CSY_CONFIG?.apiBaseUrl || "";
const usernameElement = document.getElementById("account-username");
const idElement = document.getElementById("account-id");
const rankElement = document.getElementById("account-rank");
const createdElement = document.getElementById("account-created");
const emailElement = document.getElementById("account-email");
const emailVerificationStatus = document.getElementById("email-verification-status");
const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email-input");
const emailSubmitButton = document.getElementById("email-submit-button");
const emailFormStatus = document.getElementById("email-form-status");
const emailVerifiedMessage = document.getElementById("email-verified-message");
const passwordForm = document.getElementById("password-form");
const passwordStatus = document.getElementById("password-status");
const logoutButton = document.getElementById("logout-button");
const logoutStatus = document.getElementById("logout-status");

function setStatus(element, message, type = "") {
    element.textContent = message;
    element.className = "form-status" + (type ? " " + type : "");
}

function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
        credentials: "include",
        cache: "no-store",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
}

function displayAccount(player) {
    usernameElement.textContent = player.username;
    idElement.textContent = player.id;
    rankElement.textContent = player.rank;
    createdElement.textContent = formatDate(player.createdAt);
    emailElement.textContent = "Loading email status…";
    emailVerificationStatus.textContent = "Checking…";
}

async function loadAccount() {
    try {
        const data = await api("/api/me");
        displayAccount(data.player);
        const email = await api("/api/account/email/status");
        emailElement.textContent = email.email || "Not linked";
        emailInput.value = email.pendingEmail || email.email || "";
        emailSubmitButton.disabled = !email.emailActionsAvailable;
        if (!email.emailActionsAvailable) {
            setStatus(emailFormStatus, "Email delivery has not been configured yet. Your account and current email remain unchanged.");
        }
        if (email.emailVerified) {
            emailVerificationStatus.textContent = "Verified";
            emailVerifiedMessage.classList.remove("hidden");
            emailSubmitButton.textContent = "Change Email";
        } else if (email.pendingEmail) {
            emailVerificationStatus.textContent = "Verification pending";
            emailVerifiedMessage.classList.add("hidden");
            emailSubmitButton.textContent = "Resend Verification Email";
        } else {
            emailVerificationStatus.textContent = "Not verified";
            emailVerifiedMessage.classList.add("hidden");
            emailSubmitButton.textContent = "Send Verification Email";
        }
    } catch (error) {
        if (/sign in/i.test(error.message)) {
            window.location.href = "./login.html";
            return;
        }
        setStatus(emailFormStatus, error.message, "error");
    }
}

emailForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
        setStatus(emailFormStatus, "Enter an email address.", "error");
        return;
    }
    emailSubmitButton.disabled = true;
    setStatus(emailFormStatus, "Sending verification email…");
    try {
        const data = await api("/api/account/email/request-verification", {
            method: "POST",
            body: JSON.stringify({ email })
        });
        setStatus(emailFormStatus, data.message || "Check your inbox for a verification link.", "success");
        await loadAccount();
    } catch (error) {
        setStatus(emailFormStatus, error.message, "error");
    } finally {
        emailSubmitButton.disabled = false;
    }
});

passwordForm.addEventListener("submit", async event => {
    event.preventDefault();
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    if (newPassword !== confirmPassword) {
        setStatus(passwordStatus, "New passwords do not match.", "error");
        return;
    }
    setStatus(passwordStatus, "Changing password…");
    try {
        const data = await api("/api/auth/change-password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword })
        });
        setStatus(passwordStatus, data.message || "Password changed. Please sign in again.", "success");
        passwordForm.reset();
        setTimeout(() => { window.location.href = "./login.html"; }, 1200);
    } catch (error) {
        setStatus(passwordStatus, error.message, "error");
    }
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    setStatus(logoutStatus, "Signing out…");
    try {
        await api("/api/auth/logout", { method: "POST", body: "{}" });
        window.location.href = "./login.html";
    } catch (error) {
        logoutButton.disabled = false;
        setStatus(logoutStatus, error.message, "error");
    }
});

loadAccount();
