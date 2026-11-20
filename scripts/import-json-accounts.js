"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getPool, closeDatabase } = require("../db");
const { sanitizeSettings } = require("../account-auth");

const ACCOUNT_FILE = path.resolve(
    process.env.CSY_ACCOUNT_FILE || path.join(__dirname, "..", "private-data", "accounts.json")
);
const CARD_IDS = new Set(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cards.json"), "utf8")).map(card => card.id)
);
const LOCK_KEY = "684925731";
const ACCOUNT_ID = /^acct_[a-f0-9]{32}$/;
const PLAYER_ID = /^[a-f0-9]{48}$/;
const DECK_ID = /^deck_[a-f0-9]{32}$/;
const TOKEN_HASH = /^[a-f0-9]{64}$/;
const PASSWORD_HASH = /^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (isPlainObject(value)) {
        return "{" + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ":" + stableJson(value[key])
        ).join(",") + "}";
    }
    return JSON.stringify(value);
}

function validDate(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function readSource(file = ACCOUNT_FILE) {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        throw new Error("Cannot read account source file: " + error.message);
    }
    if (!isPlainObject(data) || data.version !== 1 ||
        !Array.isArray(data.accounts) || !Array.isArray(data.sessions)) {
        throw new Error("Account source must be version 1 with accounts and sessions arrays.");
    }
    return data;
}

function validateSource(data, now = Date.now()) {
    if (!isPlainObject(data) || data.version !== 1 ||
        !Array.isArray(data.accounts) || !Array.isArray(data.sessions)) {
        throw new Error("Account source must be version 1 with accounts and sessions arrays.");
    }

    const accountIds = new Set();
    const playerIds = new Set();
    const usernames = new Set();
    const deckIds = new Set();
    const accounts = data.accounts.map((account, index) => {
        const label = "accounts[" + index + "]";
        if (!isPlainObject(account) || !ACCOUNT_ID.test(account.id || "") ||
            typeof account.username !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(account.username) ||
            account.usernameKey !== account.username.toLowerCase() ||
            !PLAYER_ID.test(account.playerId || "") ||
            !PASSWORD_HASH.test(account.passwordHash || "") ||
            !validDate(account.createdAt)) {
            throw new Error("Invalid account record at " + label + ".");
        }
        if (accountIds.has(account.id) || playerIds.has(account.playerId) ||
            usernames.has(account.usernameKey)) {
            throw new Error("Duplicate account identity in source at " + label + ".");
        }
        accountIds.add(account.id);
        playerIds.add(account.playerId);
        usernames.add(account.usernameKey);

        const profile = isPlainObject(account.profile) ? account.profile : {};
        const displayName = typeof profile.displayName === "string" ? profile.displayName.trim().slice(0, 24) : "";
        const bio = typeof profile.bio === "string" ? profile.bio.trim().slice(0, 240) : "";
        const settings = sanitizeSettings(isPlainObject(account.settings) ? account.settings : {});
        const decksInput = Array.isArray(account.decks) ? account.decks : [];
        if (decksInput.length > 25) throw new Error("Account has more than 25 saved decks at " + label + ".");
        const decks = decksInput.map((deck, deckIndex) => {
            const deckLabel = label + ".decks[" + deckIndex + "]";
            if (!isPlainObject(deck) || !DECK_ID.test(deck.id || "") ||
                typeof deck.name !== "string" || !deck.name.trim() || deck.name.trim().length > 40 ||
                !Array.isArray(deck.cards) || deck.cards.length > 60 ||
                !deck.cards.every(cardId => typeof cardId === "string" && CARD_IDS.has(cardId)) ||
                !validDate(deck.createdAt) || !validDate(deck.updatedAt)) {
                throw new Error("Invalid saved deck at " + deckLabel + ".");
            }
            if (deckIds.has(deck.id)) throw new Error("Duplicate saved deck ID in source: " + deck.id);
            deckIds.add(deck.id);
            return {
                id: deck.id,
                name: deck.name.trim(),
                createdAt: new Date(deck.createdAt),
                updatedAt: new Date(deck.updatedAt),
                cards: deck.cards.slice()
            };
        });

        return {
            id: account.id,
            playerId: account.playerId,
            username: account.username,
            usernameKey: account.usernameKey,
            passwordHash: account.passwordHash,
            createdAt: new Date(account.createdAt),
            updatedAt: new Date(validDate(account.updatedAt) ? account.updatedAt : account.createdAt),
            profile: { displayName, bio },
            settings,
            decks
        };
    });

    const sessions = [];
    let expiredSessions = 0;
    const sessionHashes = new Set();
    for (let index = 0; index < data.sessions.length; index += 1) {
        const session = data.sessions[index];
        if (!isPlainObject(session) || !TOKEN_HASH.test(session.tokenHash || "") ||
            !accountIds.has(session.accountId) ||
            !Number.isFinite(session.createdAt) || !Number.isFinite(session.expiresAt) ||
            session.expiresAt <= session.createdAt) {
            throw new Error("Invalid session record at sessions[" + index + "].");
        }
        if (sessionHashes.has(session.tokenHash)) {
            throw new Error("Duplicate session token hash in source.");
        }
        sessionHashes.add(session.tokenHash);
        if (session.expiresAt <= now) {
            expiredSessions += 1;
            continue;
        }
        sessions.push({
            tokenHash: session.tokenHash,
            accountId: session.accountId,
            createdAt: new Date(session.createdAt),
            expiresAt: new Date(session.expiresAt)
        });
    }

    return { accounts, sessions, expiredSessions };
}

async function findExistingAccount(client, account, lock = false) {
    const lockClause = lock ? " FOR UPDATE" : "";
    const result = await client.query(`
        SELECT id, player_id, username, username_key, password_hash
        FROM csy_private.accounts
        WHERE id = $1 OR player_id = $2 OR username_key = $3
    ` + lockClause, [account.id, account.playerId, account.usernameKey]);
    if (!result.rowCount) return false;
    if (result.rowCount !== 1) {
        throw new Error("Database identity collision for account " + account.id + ".");
    }
    const row = result.rows[0];
    if (row.id !== account.id || row.player_id !== account.playerId ||
        row.username !== account.username || row.username_key !== account.usernameKey ||
        row.password_hash !== account.passwordHash) {
        throw new Error("Existing account conflicts with source identity or password hash: " + account.id);
    }
    return true;
}

async function compareExistingDeck(client, accountId, deck, lock = false) {
    const result = await client.query(
        "SELECT id, account_id, name, created_at, updated_at FROM csy_private.decks WHERE id = $1" + (lock ? " FOR UPDATE" : ""),
        [deck.id]
    );
    if (!result.rowCount) return false;
    const row = result.rows[0];
    if (row.account_id !== accountId || row.name !== deck.name ||
        new Date(row.created_at).getTime() !== deck.createdAt.getTime() ||
        new Date(row.updated_at).getTime() !== deck.updatedAt.getTime()) {
        throw new Error("Existing saved deck conflicts with source: " + deck.id);
    }
    const cards = await client.query(
        "SELECT card_id FROM csy_private.deck_cards WHERE deck_id = $1 ORDER BY position",
        [deck.id]
    );
    if (JSON.stringify(cards.rows.map(item => item.card_id)) !== JSON.stringify(deck.cards)) {
        throw new Error("Existing saved deck cards differ from source: " + deck.id);
    }
    return true;
}

async function importSource(client, source, { apply = false } = {}) {
    const plan = { accountsInserted: 0, accountsExisting: 0, profilesInserted: 0,
        settingsInserted: 0, decksInserted: 0, decksExisting: 0,
        sessionsInserted: 0, sessionsExisting: 0, expiredSessionsSkipped: source.expiredSessions };

    if (apply) await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [LOCK_KEY]);

    for (const account of source.accounts) {
        const exists = await findExistingAccount(client, account, apply);
        if (exists) {
            plan.accountsExisting += 1;
        } else {
            if (apply) {
                await client.query(`
                    INSERT INTO csy_private.accounts
                        (id, player_id, username, username_key, password_hash, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [account.id, account.playerId, account.username, account.usernameKey,
                    account.passwordHash, account.createdAt, account.updatedAt]);
            }
            plan.accountsInserted += 1;
        }

        const [profile, settings] = await Promise.all([
            client.query("SELECT display_name, bio FROM csy_private.profiles WHERE account_id = $1" + (apply ? " FOR UPDATE" : ""), [account.id]),
            client.query("SELECT settings FROM csy_private.player_settings WHERE account_id = $1" + (apply ? " FOR UPDATE" : ""), [account.id])
        ]);
        if (profile.rowCount) {
            const row = profile.rows[0];
            if (row.display_name !== account.profile.displayName || row.bio !== account.profile.bio) {
                throw new Error("Existing profile conflicts with source account: " + account.id);
            }
        } else {
            if (apply) {
                await client.query(`
                    INSERT INTO csy_private.profiles (account_id, display_name, bio, updated_at)
                    VALUES ($1, $2, $3, $4)
                `, [account.id, account.profile.displayName, account.profile.bio, account.updatedAt]);
            }
            plan.profilesInserted += 1;
        }
        if (settings.rowCount) {
            if (stableJson(settings.rows[0].settings) !== stableJson(account.settings)) {
                throw new Error("Existing settings conflict with source account: " + account.id);
            }
        } else {
            if (apply) {
                await client.query(`
                    INSERT INTO csy_private.player_settings (account_id, settings, updated_at)
                    VALUES ($1, $2::jsonb, $3)
                `, [account.id, JSON.stringify(account.settings), account.updatedAt]);
            }
            plan.settingsInserted += 1;
        }

        for (const deck of account.decks) {
            const existsDeck = await compareExistingDeck(client, account.id, deck, apply);
            if (existsDeck) {
                plan.decksExisting += 1;
                continue;
            }
            if (apply) {
                await client.query(`
                    INSERT INTO csy_private.decks (id, account_id, name, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5)
                `, [deck.id, account.id, deck.name, deck.createdAt, deck.updatedAt]);
                for (let position = 0; position < deck.cards.length; position += 1) {
                    await client.query(
                        "INSERT INTO csy_private.deck_cards (deck_id, position, card_id) VALUES ($1, $2, $3)",
                        [deck.id, position, deck.cards[position]]
                    );
                }
            }
            plan.decksInserted += 1;
        }
    }

    for (const session of source.sessions) {
        const existing = await client.query(
            "SELECT account_id, created_at, expires_at FROM csy_private.account_sessions WHERE token_hash = $1" + (apply ? " FOR UPDATE" : ""),
            [session.tokenHash]
        );
        if (existing.rowCount) {
            const row = existing.rows[0];
            if (row.account_id !== session.accountId ||
                new Date(row.created_at).getTime() !== session.createdAt.getTime() ||
                new Date(row.expires_at).getTime() !== session.expiresAt.getTime()) {
                throw new Error("Existing session conflicts with source token hash.");
            }
            plan.sessionsExisting += 1;
            continue;
        }
        if (apply) {
            await client.query(`
                INSERT INTO csy_private.account_sessions (token_hash, account_id, created_at, expires_at)
                VALUES ($1, $2, $3, $4)
            `, [session.tokenHash, session.accountId, session.createdAt, session.expiresAt]);
        }
        plan.sessionsInserted += 1;
    }

    return plan;
}

function parseArgs(argv) {
    const args = new Set(argv);
    if (args.has("--help")) return { help: true };
    for (const arg of args) if (!["--apply", "--dry-run"].includes(arg)) {
        throw new Error("Unknown argument: " + arg);
    }
    if (args.has("--apply") === args.has("--dry-run")) {
        throw new Error("Choose exactly one mode: --dry-run or --apply.");
    }
    return { apply: args.has("--apply") };
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        process.stdout.write("Usage: node scripts/import-json-accounts.js --dry-run|--apply\n");
        return;
    }
    const data = readSource();
    const source = validateSource(data);
    const pool = getPool();
    const client = await pool.connect();
    try {
        if (options.apply) await client.query("BEGIN");
        else await client.query("BEGIN READ ONLY");
        const plan = await importSource(client, source, { apply: options.apply });
        if (options.apply) await client.query("COMMIT");
        else await client.query("ROLLBACK");
        process.stdout.write(JSON.stringify({
            mode: options.apply ? "apply" : "dry-run",
            sourceAccounts: source.accounts.length,
            sourceActiveSessions: source.sessions.length,
            ...plan
        }, null, 2) + "\n");
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
    } finally {
        client.release();
        await closeDatabase();
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write("Account import failed: " + error.message + "\n");
        process.exitCode = 1;
    });
}

module.exports = { readSource, validateSource, importSource, parseArgs };
