"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    emailConfigured, emailStatus, escapeHtml, validRecipient, validSender, validActionUrl,
    buildVerificationEmail, buildPasswordResetEmail, sendTransactionalEmail
} = require("../email");

test("email remains safely disabled until both provider key and sender are configured", () => {
    const oldKey = process.env.RESEND_API_KEY;
    const oldFrom = process.env.CSY_EMAIL_FROM;
    try {
        delete process.env.RESEND_API_KEY;
        delete process.env.CSY_EMAIL_FROM;
        assert.equal(emailConfigured(), false);
        assert.deepEqual(emailStatus(), {
            configured: false, provider: "resend", fromConfigured: false, mode: "disabled"
        });
        process.env.RESEND_API_KEY = "test-key";
        assert.equal(emailConfigured(), false);
        process.env.CSY_EMAIL_FROM = "noreply@example.test";
        assert.equal(emailConfigured(), true);
        assert.equal(emailStatus().mode, "ready");
        assert.equal(JSON.stringify(emailStatus()).includes("test-key"), false);
    } finally {
        if (oldKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = oldKey;
        if (oldFrom === undefined) delete process.env.CSY_EMAIL_FROM;
        else process.env.CSY_EMAIL_FROM = oldFrom;
    }
});

test("recipient and action URL validation rejects unsafe values", () => {
    assert.equal(validRecipient("player@example.com"), true);
    assert.equal(validRecipient("not-an-email"), false);
    assert.equal(validSender("noreply@cardstuffyes.ca"), true);
    assert.equal(validSender("Card Stuff Yes <noreply@cardstuffyes.ca>"), true);
    assert.equal(validSender("invalid sender"), false);
    assert.equal(validActionUrl("https://cardstuffyes.ca/verify"), true);
    assert.equal(validActionUrl("http://cardstuffyes.ca/verify"), false);
    assert.equal(validActionUrl("javascript:alert(1)"), false);
    assert.equal(validActionUrl("https://user:pass@example.com"), false);
});

test("HTML escaping prevents injected markup in email content", () => {
    assert.equal(escapeHtml("<script>&\"'"), "&lt;script&gt;&amp;&quot;&#39;");
});

test("verification and password reset templates contain plain text and escaped action links", () => {
    const verification = buildVerificationEmail("https://cardstuffyes.ca/verify?token=abc&x=1");
    assert.match(verification.subject, /Verify/);
    assert.match(verification.html, /&amp;x=1/);
    assert.match(verification.text, /https:\/\/cardstuffyes\.ca/);
    const reset = buildPasswordResetEmail("https://cardstuffyes.ca/reset?token=abc");
    assert.match(reset.subject, /Reset/);
    assert.match(reset.text, /30 minutes/);
    assert.throws(() => buildVerificationEmail("http://example.com"), /HTTPS/);
});

test("Resend request uses the configured CardStuffYes reply-to address", async () => {
    const oldKey = process.env.RESEND_API_KEY;
    const oldFrom = process.env.CSY_EMAIL_FROM;
    const oldReplyTo = process.env.CSY_EMAIL_REPLY_TO;
    const oldFetch = global.fetch;
    let request;
    try {
        process.env.RESEND_API_KEY = "test-key";
        process.env.CSY_EMAIL_FROM = "CardStuffYes <noreply@cardstuffyes.ca>";
        process.env.CSY_EMAIL_REPLY_TO = "contact@teamblacklight.ca";
        global.fetch = async (url, options) => {
            request = { url, options, body: JSON.parse(options.body) };
            return { ok: true, json: async () => ({ id: "test-message-id" }) };
        };
        const result = await sendTransactionalEmail({
            to: "player@example.test",
            subject: "Test",
            html: "<p>Test</p>",
            text: "Test"
        });
        assert.equal(result.sent, true);
        assert.equal(request.url, "https://api.resend.com/emails");
        assert.equal(request.body.from, "CardStuffYes <noreply@cardstuffyes.ca>");
        assert.equal(request.body.reply_to, "contact@teamblacklight.ca");
        assert.equal(request.options.headers.Authorization, "Bearer test-key");
    } finally {
        global.fetch = oldFetch;
        if (oldKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = oldKey;
        if (oldFrom === undefined) delete process.env.CSY_EMAIL_FROM;
        else process.env.CSY_EMAIL_FROM = oldFrom;
        if (oldReplyTo === undefined) delete process.env.CSY_EMAIL_REPLY_TO;
        else process.env.CSY_EMAIL_REPLY_TO = oldReplyTo;
    }
});

test("sending reports disabled instead of pretending an email was delivered", async () => {
    const oldKey = process.env.RESEND_API_KEY;
    const oldFrom = process.env.CSY_EMAIL_FROM;
    try {
        delete process.env.RESEND_API_KEY;
        delete process.env.CSY_EMAIL_FROM;
        assert.deepEqual(await sendTransactionalEmail({
            to: "player@example.com", subject: "Test", html: "<p>Test</p>", text: "Test"
        }), { sent: false, reason: "email_not_configured" });
    } finally {
        if (oldKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = oldKey;
        if (oldFrom === undefined) delete process.env.CSY_EMAIL_FROM;
        else process.env.CSY_EMAIL_FROM = oldFrom;
    }
});
