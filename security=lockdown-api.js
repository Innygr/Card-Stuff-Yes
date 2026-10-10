// ============================================================
// SECURITY LOCKDOWN INITIALIZATION
// ============================================================

const path = require("path");

const {
    createSecurityLockdown
} = require("./Modules/security-lockdown");

const securityLockdown =
    createSecurityLockdown({
        dataDirectory: path.resolve(
            __dirname,
            "private-data"
        )
    });


// ============================================================
// OWNER-ONLY SECURITY CONTROL
// ============================================================

function getSecurityOwner(req) {
    // Use the separate, authenticated admin session.
    const admin = getAdminFromSession(req);

    if (!admin) {
        return null;
    }

    if (
        String(admin.rank || "").toLowerCase() !==
        "owner"
    ) {
        return null;
    }

    return admin;
}


// ============================================================
// SECURITY LOCKDOWN ROUTES
// ============================================================
//
// Insert this inside the existing HTTP request handler,
// BEFORE ordinary API routes and before the write guard.
//
// Reuse the request URL/pathname variables if your router
// already declares them.
// ============================================================

const requestURL =
    new URL(req.url, "http://localhost");

const pathname =
    requestURL.pathname;


// Public endpoint used by the homepage banner.
if (
    pathname === "/api/security/status" &&
    (
        req.method === "GET" ||
        req.method === "HEAD"
    )
) {
    sendJSON(
        res,
        200,
        securityLockdown.getState()
    );

    return;
}


// Owner-only lockdown control.
if (
    pathname === "/api/security/lockdown" &&
    req.method === "POST"
) {
    const owner =
        getSecurityOwner(req);

    if (!owner) {
        sendJSON(
            res,
            403,
            {
                error:
                    "Only the Owner can change security lockdown state."
            }
        );

        return;
    }

    let body;

    try {
        body = await readJSON(req);
    } catch (error) {
        sendJSON(
            res,
            400,
            {
                error: error.message
            }
        );

        return;
    }

    const allowedStates = new Set([
        "suspected_breach",
        "confirmed_breach",
        "recovery",
        "normal"
    ]);

    if (!allowedStates.has(body.state)) {
        sendJSON(
            res,
            400,
            {
                error: "Invalid lockdown state."
            }
        );

        return;
    }

    const current =
        securityLockdown.getPrivateState();

    // Require a recovery review before clearing an incident.
    if (
        (
            current.state === "suspected_breach" ||
            current.state === "confirmed_breach"
        ) &&
        body.state === "normal"
    ) {
        sendJSON(
            res,
            409,
            {
                error:
                    "Move to recovery first, review the incident, then clear lockdown."
            }
        );

        return;
    }

    const next =
        securityLockdown.setState({
            state: body.state,

            reason:
                typeof body.reason === "string"
                    ? body.reason
                    : "",

            actor:
                owner.username ||
                `player-${owner.id}`
        });

    sendJSON(
        res,
        200,
        {
            ok: true,
            state: next.state,
            incidentId: next.incidentId,
            updatedAt: next.updatedAt
        }
    );

    return;
}


// ============================================================
// LOCKDOWN WRITE GUARD
// ============================================================
//
// Put this BEFORE all ordinary mutating API handlers.
//
// This blocks application API writes while lockdown is active.
// It does NOT kill the SQLite process.
// ============================================================

const isMutation = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE"
].includes(req.method);

const isLoginRoute = [
    "/api/login",
    "/api/auth/login",
    "/api/admin/login"
].includes(pathname);

const isLogoutRoute = [
    "/api/logout",
    "/api/auth/logout",
    "/api/admin/logout"
].includes(pathname);

if (
    isMutation &&
    pathname.startsWith("/api/") &&
    !isLoginRoute &&
    !isLogoutRoute &&
    pathname !== "/api/security/lockdown"
) {
    const blocked =
        securityLockdown.getWriteBlockReason();

    if (blocked) {
        sendJSON(
            res,
            503,
            {
                error: blocked.error,
                securityLockdown: true,
                state: blocked.state,
                message: blocked.message
            }
        );

        return;
    }
}
