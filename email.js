"use strict";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_RECIPIENTS = 5;

function validSender(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 254) return false;
    const candidate = value.trim();
    const match = candidate.match(/^(?:[^<>\r\n]{1,80}\s*)?<([^<>\s]+@[^<>\s]+)>$/) ||
        (candidate.includes("<") || candidate.includes(">") ? null : [null, candidate]);
    return Boolean(match && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(match[1]));
}

function emailConfigured() {
    return Boolean(
        typeof process.env.RESEND_API_KEY === "string" &&
        process.env.RESEND_API_KEY.trim() &&
        validSender(process.env.CSY_EMAIL_FROM)
    );
}

function emailStatus() {
    return {
        configured: emailConfigured(),
        provider: "resend",
        fromConfigured: Boolean(process.env.CSY_EMAIL_FROM),
        mode: emailConfigured() ? "ready" : "disabled"
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function validRecipient(value) {
    return typeof value === "string" && value.length <= 254 &&
        /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function validActionUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

function buildActionEmail({ title, intro, actionLabel, actionUrl, expiryNotice }) {
    if (!validActionUrl(actionUrl)) throw new TypeError("Email action links must be absolute HTTPS URLs.");
    const safeTitle = escapeHtml(title);
    const safeIntro = escapeHtml(intro);
    const safeLabel = escapeHtml(actionLabel);
    const safeUrl = escapeHtml(actionUrl);
    const safeExpiry = escapeHtml(expiryNotice);
    return {
        html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#10131b;color:#eef2ff;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#191f2b;border:1px solid #30394b;border-radius:16px"><h1 style="font-size:24px">${safeTitle}</h1><p style="line-height:1.6">${safeIntro}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;background:#6578f5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">${safeLabel}</a></p><p style="color:#b8c1d6;font-size:13px;line-height:1.6">${safeExpiry}</p><p style="color:#8f9bb2;font-size:12px">If you did not request this, you can ignore this email.</p></main></body></html>`,
        text: title + "\n\n" + intro + "\n\n" + actionLabel + ": " + actionUrl + "\n\n" + expiryNotice + "\n\nIf you did not request this, you can ignore this email."
    };
}

function buildVerificationEmail(actionUrl) {
    return {
        subject: "Verify your Card Stuff Yes email",
        ...buildActionEmail({
            title: "Verify your email",
            intro: "Confirm this email address to finish setting up your Card Stuff Yes account.",
            actionLabel: "Verify email address",
            actionUrl,
            expiryNotice: "This verification link expires after 24 hours."
        })
    };
}

function buildPasswordResetEmail(actionUrl) {
    return {
        subject: "Reset your Card Stuff Yes password",
        ...buildActionEmail({
            title: "Reset your password",
            intro: "A password reset was requested for your Card Stuff Yes account.",
            actionLabel: "Choose a new password",
            actionUrl,
            expiryNotice: "This link expires after 30 minutes and can only be used once."
        })
    };
}

async function sendTransactionalEmail({ to, subject, html, text, replyTo, idempotencyKey }) {
    if (!emailConfigured()) return { sent: false, reason: "email_not_configured" };
    const recipients = Array.isArray(to) ? to : [to];
    if (!recipients.length || recipients.length > MAX_RECIPIENTS || !recipients.every(validRecipient)) {
        throw new TypeError("Email recipient address is invalid.");
    }
    if (typeof subject !== "string" || !subject.trim() || subject.length > 160 ||
        typeof html !== "string" || !html.trim() || html.length > 100_000 ||
        typeof text !== "string" || !text.trim() || text.length > 20_000) {
        throw new TypeError("Email subject and content are required and must be within size limits.");
    }
    if (replyTo !== undefined && !validRecipient(replyTo)) {
        throw new TypeError("Reply-to address is invalid.");
    }
    const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY.trim(),
            "Content-Type": "application/json",
            ...(typeof idempotencyKey === "string" && /^[a-f0-9_]{16,80}$/.test(idempotencyKey)
                ? { "Idempotency-Key": idempotencyKey } : {})
        },
        body: JSON.stringify({
            from: process.env.CSY_EMAIL_FROM.trim(),
            to: recipients,
            subject: subject.trim(),
            html,
            text,
            ...(replyTo ? { reply_to: replyTo } : {})
        }),
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
        throw new Error("Transactional email provider rejected the request (HTTP " + response.status + ").");
    }
    let result;
    try { result = await response.json(); } catch { result = {}; }
    return { sent: true, messageId: typeof result.id === "string" ? result.id : null };
}

module.exports = {
    emailConfigured, emailStatus, escapeHtml, validRecipient, validSender, validActionUrl,
    buildVerificationEmail, buildPasswordResetEmail, sendTransactionalEmail
};
