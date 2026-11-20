"use strict";

const crypto = require("node:crypto");
const { getPool } = require("./db");
const { emailConfigured, sendTransactionalEmail } = require("./email");

const MAX_ATTEMPTS = 5;
const MAX_PER_TICK = 5;
let workerRunning = false;

function emailBaseConfigured() {
    try {
        const url = new URL(String(process.env.CSY_PUBLIC_BASE_URL || "").trim());
        return url.protocol === "https:" && !url.username && !url.password &&
            url.pathname === "/" && !url.search && !url.hash;
    } catch {
        return false;
    }
}

function emailOutboxEnabled() {
    return emailConfigured() && emailBaseConfigured() &&
        String(process.env.CSY_ACCOUNT_STORAGE || "").trim().toLowerCase() === "postgres";
}

function retryDelayMs(attempt) {
    return Math.min(15 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

async function enqueueEmail(client, { accountId, tokenHash, purpose, to, message }) {
    if (!client || typeof client.query !== "function") throw new TypeError("A database transaction client is required.");
    if (!accountId || !["verify_email", "password_reset"].includes(purpose) ||
        typeof to !== "string" || !message || typeof message.subject !== "string" ||
        typeof message.html !== "string" || typeof message.text !== "string") {
        throw new TypeError("Transactional email queue item is invalid.");
    }
    const id = "mail_" + crypto.randomBytes(16).toString("hex");
    await client.query(`
        INSERT INTO csy_private.email_outbox
            (id, account_id, token_hash, purpose, recipient, subject, html, text_body)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, accountId, tokenHash || null, purpose, to, message.subject, message.html, message.text]);
    return id;
}

async function claimNextEmail() {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const found = await client.query(`
            SELECT id, account_id, token_hash, purpose, recipient, subject, html, text_body, attempts
            FROM csy_private.email_outbox
            WHERE (status = 'pending' AND available_at <= now())
               OR (status = 'sending' AND locked_at < now() - interval '2 minutes')
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        `);
        if (!found.rowCount) {
            await client.query("COMMIT");
            return null;
        }
        const item = found.rows[0];
        const updated = await client.query(`
            UPDATE csy_private.email_outbox
            SET status = 'sending', locked_at = now(),
                attempts = LEAST(attempts + 1, $2), updated_at = now()
            WHERE id = $1
            RETURNING attempts
        `, [item.id, MAX_ATTEMPTS]);
        await client.query("COMMIT");
        return { ...item, attempts: updated.rows[0].attempts };
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
    } finally {
        client.release();
    }
}

async function finishEmail(item, result) {
    await getPool().query(`
        UPDATE csy_private.email_outbox
        SET status = 'sent', provider_message_id = $2, sent_at = now(),
            recipient = '', subject = '', html = '', text_body = '',
            token_hash = NULL, locked_at = NULL, updated_at = now()
        WHERE id = $1
    `, [item.id, result.messageId]);
}

async function retryOrFailEmail(item) {
    if (item.attempts >= MAX_ATTEMPTS) {
        const client = await getPool().connect();
        try {
            await client.query("BEGIN");
            await client.query(`
                UPDATE csy_private.email_outbox
                SET status = 'failed', recipient = '', subject = '',
                    html = '', text_body = '', locked_at = NULL,
                    token_hash = NULL, updated_at = now()
                WHERE id = $1
            `, [item.id]);
            if (item.token_hash) {
                await client.query(
                    "DELETE FROM csy_private.account_email_tokens WHERE token_hash = $1",
                    [item.token_hash]
                );
            }
            if (item.purpose === "verify_email") {
                await client.query(`
                    UPDATE csy_private.accounts
                    SET pending_email = NULL, updated_at = now()
                    WHERE id = $1 AND lower(pending_email) = lower($2)
                `, [item.account_id, item.recipient]);
            }
            await client.query("COMMIT");
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            throw error;
        } finally {
            client.release();
        }
        return;
    }

    await getPool().query(`
        UPDATE csy_private.email_outbox
        SET status = 'pending', locked_at = NULL,
            available_at = now() + ($2 * interval '1 millisecond'),
            updated_at = now()
        WHERE id = $1
    `, [item.id, retryDelayMs(item.attempts)]);
}

async function processOneEmail() {
    if (!emailOutboxEnabled()) return false;
    const item = await claimNextEmail();
    if (!item) return false;
    try {
        const result = await sendTransactionalEmail({
            to: item.recipient,
            subject: item.subject,
            html: item.html,
            text: item.text_body,
            idempotencyKey: item.id
        });
        if (!result.sent) throw new Error("Email transport is disabled.");
        await finishEmail(item, result);
    } catch {
        await retryOrFailEmail(item);
        console.error("Transactional email delivery attempt failed.");
    }
    return true;
}

async function processEmailOutbox() {
    if (workerRunning || !emailOutboxEnabled()) return 0;
    workerRunning = true;
    let processed = 0;
    try {
        for (let index = 0; index < MAX_PER_TICK; index += 1) {
            if (!(await processOneEmail())) break;
            processed += 1;
        }
    } finally {
        workerRunning = false;
    }
    return processed;
}

module.exports = {
    emailOutboxEnabled,
    retryDelayMs,
    enqueueEmail,
    claimNextEmail,
    processOneEmail,
    processEmailOutbox
};
