"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VALID_STATES = new Set([
    "normal",
    "suspected_breach",
    "confirmed_breach",
    "recovery"
]);

const MESSAGES = {
    normal: "",
    suspected_breach:
        "A possible security breach has been detected. Some features are temporarily restricted while we investigate.",
    confirmed_breach:
        "A security incident has been confirmed. Sensitive features are temporarily disabled while we protect player accounts and game data.",
    recovery:
        "Card Stuff Yes is in restricted recovery mode while security checks are completed."
};

function createSecurityLockdown(options = {}) {
    const dataDirectory = path.resolve(
        options.dataDirectory ||
        path.join(process.cwd(), "private-data")
    );

    const stateFile = path.join(
        dataDirectory,
        "security-lockdown.json"
    );

    const logFile = path.join(
        dataDirectory,
        "security-incidents.jsonl"
    );

    fs.mkdirSync(dataDirectory, {
        recursive: true,
        mode: 0o700
    });

    function defaultState() {
        return {
            state: "normal",
            incidentId: null,
            reason: null,
            startedAt: null,
            updatedAt: new Date().toISOString(),
            updatedBy: null
        };
    }

    function readState() {
        try {
            const data = JSON.parse(
                fs.readFileSync(stateFile, "utf8")
            );

            return data &&
                VALID_STATES.has(data.state)
                ? data
                : defaultState();

        } catch (error) {
            if (error.code !== "ENOENT") {
                console.error(
                    "Could not read security state:",
                    error.message
                );
            }

            return defaultState();
        }
    }

    function appendLog(entry) {
        fs.appendFileSync(
            logFile,
            JSON.stringify({
                timestamp: new Date().toISOString(),
                ...entry
            }) + "\n",
            {
                encoding: "utf8",
                mode: 0o600
            }
        );
    }

    function writeState(data) {
        const temporary =
            stateFile + "." + process.pid + ".tmp";

        fs.writeFileSync(
            temporary,
            JSON.stringify(data, null, 2),
            {
                encoding: "utf8",
                mode: 0o600
            }
        );

        fs.renameSync(temporary, stateFile);
    }

    function getState() {
        const state = readState();

        return {
            state: state.state,
            active: state.state !== "normal",
            incidentId: state.incidentId,
            startedAt: state.startedAt,
            updatedAt: state.updatedAt,
            message: MESSAGES[state.state] || ""
        };
    }

    function setState({
        state,
        reason = "",
        actor = "system"
    }) {
        if (!VALID_STATES.has(state)) {
            throw new Error(
                "Invalid security lockdown state."
            );
        }

        const old = readState();
        const now = new Date().toISOString();

        const incidentActive =
            state === "suspected_breach" ||
            state === "confirmed_breach";

        const next = {
            state,

            incidentId: incidentActive
                ? (
                    old.incidentId ||
                    crypto.randomBytes(6)
                        .toString("hex")
                        .toUpperCase()
                )
                : old.incidentId,

            reason: String(reason).slice(0, 500),

            startedAt: incidentActive
                ? (old.startedAt || now)
                : old.startedAt,

            updatedAt: now,

            updatedBy: String(actor).slice(0, 100)
        };

        if (state === "normal") {
            next.incidentId = null;
            next.reason = null;
            next.startedAt = null;
        }

        writeState(next);

        appendLog({
            event: "lockdown_state_changed",
            previousState: old.state,
            state: next.state,
            incidentId: next.incidentId,
            reason: next.reason,
            actor: next.updatedBy
        });

        return next;
    }

    function getWriteBlockReason() {
        const state = readState();

        if (state.state === "normal") {
            return null;
        }

        return {
            state: state.state,
            error:
                "Writes are temporarily disabled during a security incident.",
            message: MESSAGES[state.state]
        };
    }

    function recordSignal({
        severity = "warning",
        source = "unknown",
        code = "UNCLASSIFIED",
        message = ""
    }) {
        const allowed = new Set([
            "warning",
            "critical",
            "security"
        ]);

        appendLog({
            event: "security_signal",

            severity: allowed.has(severity)
                ? severity
                : "warning",

            source: String(source).slice(0, 100),
            code: String(code).slice(0, 100),

            // Never log passwords, cookies, session tokens,
            // authorization headers, or other secrets.
            message: String(message).slice(0, 500)
        });
    }

    return {
        getState,
        getPrivateState: readState,
        setState,
        isWriteBlocked: () =>
            readState().state !== "normal",
        getWriteBlockReason,
        recordSignal
    };
}

module.exports = {
    createSecurityLockdown,
    VALID_STATES
};
