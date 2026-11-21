"use strict";

const { verifyJoinTicket } = require("./community-join-tickets");
const { importCommunityJoinPublicKeys } = require("./community-join-ticket-keyset");

function createCommunityJoinRedeemer({
    issuer,
    serverId,
    publicKeySet,
    replayStore,
    now = () => Math.floor(Date.now() / 1000),
    clockSkewSeconds = 5
}) {
    if (typeof issuer !== "string" || !issuer || issuer.length > 256) {
        throw new TypeError("A trusted issuer identifier is required.");
    }
    if (typeof serverId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(serverId)) {
        throw new TypeError("A valid exact community server ID is required.");
    }
    if (!replayStore || typeof replayStore.consume !== "function") {
        throw new TypeError("A durable or bounded replay store is required.");
    }
    if (typeof now !== "function") throw new TypeError("A clock function is required.");
    const publicKeys = importCommunityJoinPublicKeys(publicKeySet);

    return Object.freeze({
        async redeem(token) {
            const currentTime = now();
            let verified;
            try {
                verified = verifyJoinTicket(token, {
                    publicKeys,
                    issuer,
                    audience: serverId,
                    now: currentTime,
                    clockSkewSeconds
                });
            } catch {
                // Invalid signatures, claims, issuer, or audience are normal
                // authentication failures, not infrastructure failures.
                return Object.freeze({ accepted: false, reason: "invalid_ticket" });
            }
            // The replay store must atomically claim the ticket ID. A storage
            // outage must propagate so the host can fail closed.
            const consumed = await replayStore.consume({
                ticketId: verified.ticketId,
                expiresAt: verified.expiresAt
            }, currentTime);
            if (consumed !== true) {
                return Object.freeze({ accepted: false, reason: "ticket_already_used_or_expired" });
            }
            return Object.freeze({
                accepted: true,
                player: Object.freeze({
                    externalSubject: verified.subject,
                    issuer: verified.issuer,
                    serverId: verified.audience
                })
            });
        }
    });
}

module.exports = { createCommunityJoinRedeemer };
