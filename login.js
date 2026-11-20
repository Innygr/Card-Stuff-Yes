"use strict";

const API_BASE = window.CSY_CONFIG?.apiBaseUrl || "";
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const heading = document.getElementById("auth-heading");
const status = document.getElementById("auth-status");

function selectMode(mode) {
    const registering = mode === "register";
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    loginTab.classList.toggle("active", !registering);
    registerTab.classList.toggle("active", registering);
    loginTab.setAttribute("aria-selected", String(!registering));
    registerTab.setAttribute("aria-selected", String(registering));
    heading.textContent = registering ? "Create your account" : "Welcome back";
    status.textContent = "";
    status.className = "status";
}

function setStatus(message, type = "") {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
}

async function submitAuth(form, route) {
    const button = form.querySelector("button[type=submit]");
    const fields = new FormData(form);
    const payload = {
        username: String(fields.get("username") || "").trim(),
        password: String(fields.get("password") || "")
    };
    button.disabled = true;
    setStatus(route.endsWith("register") ? "Creating account…" : "Signing in…");
    try {
        const response = await fetch(API_BASE + route, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not complete sign-in.");
        setStatus(route.endsWith("register") ? "Account created. Opening your account…" : "Signed in. Opening your account…", "success");
        window.location.assign(window.CSY_CONFIG?.routes?.account || "./account.html");
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        button.disabled = false;
    }
}

loginTab.addEventListener("click", () => selectMode("login"));
registerTab.addEventListener("click", () => selectMode("register"));
loginForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAuth(loginForm, "/api/auth/login");
});
registerForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAuth(registerForm, "/api/auth/register");
});

(async function redirectIfSignedIn() {
    try {
        const response = await fetch(API_BASE + "/api/auth/me", { credentials: "include", cache: "no-store" });
        if (response.ok) window.location.replace("./account.html");
    } catch {}
})();
