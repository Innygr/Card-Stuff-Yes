/*
 * ============================================================
 * Card Stuff Yes
 * Client Protocol Module
 * ============================================================
 *
 * This module defines the communication protocol between:
 *
 *     PC browser
 *     Mobile browser
 *     Future console client
 *
 * and the Card Stuff Yes server.
 *
 *
 * IMPORTANT:
 *
 * This module does NOT decide whether an action is legal.
 *
 * For example:
 *
 *     "use ability"
 *
 * is a valid protocol message.
 *
 * Whether the player is actually allowed to use that ability
 * is handled by game-actions.js and the game rules.
 *
 *
 * This separation is important because every client can use
 * the exact same protocol.
 *
 *
 * Example:
 *
 * PC:
 *
 *     {
 *         type: "game.action",
 *         action: "useAbility",
 *         payload: {
 *             cardId: "S01-01",
 *             abilityId: "ability-1"
 *         }
 *     }
 *
 *
 * Mobile:
 *
 *     EXACTLY THE SAME MESSAGE
 *
 *
 * Future console:
 *
 *     EXACTLY THE SAME MESSAGE
 *
 *
 * ============================================================
 */

const crypto = require("crypto");


/* ============================================================
   PROTOCOL VERSION
   ============================================================ */

const PROTOCOL_VERSION = 1;


/* ============================================================
   MESSAGE TYPES
   ============================================================ */

const MESSAGE_TYPES = Object.freeze({

    HELLO:
        "hello",

    HELLO_ACK:
        "hello.ack",

    ERROR:
        "error",

    PING:
        "ping",

    PONG:
        "pong",

    GAME_ACTION:
        "game.action",

    GAME_STATE:
        "game.state",

    GAME_EVENT:
        "game.event",

    RECONNECT:
        "game.reconnect",

    RECONNECT_RESULT:
        "game.reconnect.result",

    PRESENCE:
        "presence",

    QUEUE:
        "queue",

    MATCH_FOUND:
        "match.found",

    MATCH_ENDED:
        "match.ended"

});


/* ============================================================
   ACTION TYPES
   ============================================================ */

const ACTIONS = Object.freeze({

    JOIN_GAME:
        "joinGame",

    RECONNECT:
        "reconnect",

    PLAY_CARD:
        "playCard",

    USE_ABILITY:
        "useAbility",

    END_TURN:
        "endTurn",

    DRAW_CARD:
        "drawCard",

    DISCARD_CARD:
        "discardCard",

    PASS:
        "pass",

    ACTIVITY:
        "activity"

});


/* ============================================================
   EVENT TYPES
   ============================================================ */

const EVENTS = Object.freeze({

    GAME_STARTED:
        "game.started",

    GAME_STATE_UPDATED:
        "game.state.updated",

    CARD_DRAWN:
        "card.drawn",

    CARD_PLAYED:
        "card.played",

    ABILITY_USED:
        "ability.used",

    CARD_DISCARDED:
        "card.discarded",

    TURN_STARTED:
        "turn.started",

    TURN_ENDED:
        "turn.ended",

    TURN_AUTO_ENDED:
        "turn.autoEnded",

    PLAYER_DISCONNECTED:
        "player.disconnected",

    PLAYER_RECONNECTED:
        "player.reconnected",

    PLAYER_FORFEITED:
        "player.forfeited",

    GAME_ENDED:
        "game.ended"

});


/* ============================================================
   ERROR CODES
   ============================================================ */

const ERROR_CODES = Object.freeze({

    INVALID_MESSAGE:
        "INVALID_MESSAGE",

    INVALID_ACTION:
        "INVALID_ACTION",

    NOT_AUTHENTICATED:
        "NOT_AUTHENTICATED",

    NOT_IN_GAME:
        "NOT_IN_GAME",

    NOT_YOUR_TURN:
        "NOT_YOUR_TURN",

    CARD_NOT_FOUND:
        "CARD_NOT_FOUND",

    CARD_NOT_IN_HAND:
        "CARD_NOT_IN_HAND",

    CARD_NOT_IN_PLAY:
        "CARD_NOT_IN_PLAY",

    ABILITY_NOT_FOUND:
        "ABILITY_NOT_FOUND",

    INSUFFICIENT_RESOURCES:
        "INSUFFICIENT_RESOURCES",

    INVALID_TARGET:
        "INVALID_TARGET",

    ACTION_NOT_ALLOWED:
        "ACTION_NOT_ALLOWED",

    GAME_NOT_ACTIVE:
        "GAME_NOT_ACTIVE",

    RECONNECT_EXPIRED:
        "RECONNECT_EXPIRED",

    PROTOCOL_MISMATCH:
        "PROTOCOL_MISMATCH",

    SERVER_ERROR:
        "SERVER_ERROR"

});


/* ============================================================
   createClientProtocol
   ============================================================ */

function createClientProtocol(options = {}) {

    const version =
        Number.isInteger(
            options.version
        )
            ? options.version
            : PROTOCOL_VERSION;


    return {

        version,

        MESSAGE_TYPES,

        ACTIONS,

        EVENTS,

        ERROR_CODES,

        createMessage,

        createHelloMessage,

        createActionMessage,

        createActivityMessage,

        createReconnectMessage,

        createStateMessage,

        createEventMessage,

        createErrorMessage,

        validateMessage,

        validateActionMessage,

        parseMessage

    };

}


/* ============================================================
   createMessage
   ============================================================ */

function createMessage(
    type,
    payload = {}
) {

    if (
        typeof type !== "string" ||
        type.trim() === ""
    ) {

        throw new Error(
            "Protocol message type is required."
        );

    }


    return {

        version:
            PROTOCOL_VERSION,

        type,

        payload:
            payload &&
            typeof payload === "object"
                ? payload
                : {}

    };

}


/* ============================================================
   createHelloMessage
   ============================================================ */

function createHelloMessage(
    clientInfo = {}
) {

    return createMessage(

        MESSAGE_TYPES.HELLO,

        {

            clientVersion:
                String(
                    clientInfo.clientVersion ||
                    "unknown"
                ),

            platform:
                normalizePlatform(
                    clientInfo.platform
                ),

            protocolVersion:
                PROTOCOL_VERSION

        }

    );

}


/* ============================================================
   createActionMessage
   ============================================================ */

function createActionMessage(
    action,
    payload = {},
    requestId = null
) {

    if (
        !Object.values(ACTIONS)
            .includes(action)
    ) {

        throw new Error(
            `Unknown game action: ${action}`
        );

    }


    return createMessage(

        MESSAGE_TYPES.GAME_ACTION,

        {

            action,

            requestId:
                requestId ||
                createRequestId(),

            data:
                payload &&
                typeof payload === "object"
                    ? payload
                    : {}

        }

    );

}


/* ============================================================
   createActivityMessage
   ============================================================ */

function createActivityMessage(
    requestId = null
) {

    return createActionMessage(

        ACTIONS.ACTIVITY,

        {},

        requestId

    );

}


/* ============================================================
   createReconnectMessage
   ============================================================ */

function createReconnectMessage(
    reconnectToken,
    requestId = null
) {

    return createMessage(

        MESSAGE_TYPES.RECONNECT,

        {

            reconnectToken:
                String(
                    reconnectToken ||
                    ""
                ),

            requestId:
                requestId ||
                createRequestId()

        }

    );

}


/* ============================================================
   createStateMessage
   ============================================================ */

function createStateMessage(
    state
) {

    return createMessage(

        MESSAGE_TYPES.GAME_STATE,

        {

            state:
                state &&
                typeof state === "object"
                    ? state
                    : {}

        }

    );

}


/* ============================================================
   createEventMessage
   ============================================================ */

function createEventMessage(
    event,
    data = {}
) {

    if (
        !Object.values(EVENTS)
            .includes(event)
    ) {

        throw new Error(
            `Unknown game event: ${event}`
        );

    }


    return createMessage(

        MESSAGE_TYPES.GAME_EVENT,

        {

            event,

            data:
                data &&
                typeof data === "object"
                    ? data
                    : {}

        }

    );

}


/* ============================================================
   createErrorMessage
   ============================================================ */

function createErrorMessage(
    code,
    message,
    requestId = null,
    details = null
) {

    return createMessage(

        MESSAGE_TYPES.ERROR,

        {

            code,

            message:
                String(
                    message ||
                    "An unknown error occurred."
                ),

            requestId,

            details

        }

    );

}


/* ============================================================
   validateMessage
   ============================================================ */

function validateMessage(
    message
) {

    if (
        !message ||
        typeof message !== "object"
    ) {

        return {

            valid: false,

            error:
                "Message must be an object."

        };

    }


    if (
        message.version !== PROTOCOL_VERSION
    ) {

        return {

            valid: false,

            error:
                "Protocol version mismatch.",

            code:
                ERROR_CODES.PROTOCOL_MISMATCH

        };

    }


    if (
        typeof message.type !== "string"
    ) {

        return {

            valid: false,

            error:
                "Message type is required.",

            code:
                ERROR_CODES.INVALID_MESSAGE

        };

    }


    if (
        !Object.values(
            MESSAGE_TYPES
        ).includes(
            message.type
        )
    ) {

        return {

            valid: false,

            error:
                "Unknown message type.",

            code:
                ERROR_CODES.INVALID_MESSAGE

        };

    }


    if (
        message.payload !== undefined &&
        (
            !message.payload ||
            typeof message.payload !== "object" ||
            Array.isArray(message.payload)
        )
    ) {

        return {

            valid: false,

            error:
                "Message payload must be an object.",

            code:
                ERROR_CODES.INVALID_MESSAGE

        };

    }


    return {

        valid: true

    };

}


/* ============================================================
   validateActionMessage
   ============================================================ */

function validateActionMessage(
    message
) {

    const base =
        validateMessage(
            message
        );


    if (
        !base.valid
    ) {

        return base;

    }


    if (
        message.type !==
        MESSAGE_TYPES.GAME_ACTION
    ) {

        return {

            valid: false,

            error:
                "Message is not a game action.",

            code:
                ERROR_CODES.INVALID_ACTION

        };

    }


    const payload =
        message.payload;


    if (
        !payload ||
        typeof payload.action !== "string"
    ) {

        return {

            valid: false,

            error:
                "Game action is required.",

            code:
                ERROR_CODES.INVALID_ACTION

        };

    }


    if (
        !Object.values(
            ACTIONS
        ).includes(
            payload.action
        )
    ) {

        return {

            valid: false,

            error:
                "Unknown game action.",

            code:
                ERROR_CODES.INVALID_ACTION

        };

    }


    if (
        payload.data !== undefined &&
        (
            !payload.data ||
            typeof payload.data !== "object" ||
            Array.isArray(payload.data)
        )
    ) {

        return {

            valid: false,

            error:
                "Action data must be an object.",

            code:
                ERROR_CODES.INVALID_ACTION

        };

    }


    return {

        valid: true

    };

}


/* ============================================================
   parseMessage
   ============================================================ */

function parseMessage(
    rawMessage
) {

    let parsed;


    if (
        typeof rawMessage === "string"
    ) {

        try {

            parsed =
                JSON.parse(
                    rawMessage
                );

        } catch (error) {

            return {

                valid: false,

                error:
                    "Message is not valid JSON.",

                code:
                    ERROR_CODES.INVALID_MESSAGE

            };

        }

    } else if (
        Buffer.isBuffer(
            rawMessage
        )
    ) {

        try {

            parsed =
                JSON.parse(
                    rawMessage.toString(
                        "utf8"
                    )
                );

        } catch (error) {

            return {

                valid: false,

                error:
                    "Message is not valid JSON.",

                code:
                    ERROR_CODES.INVALID_MESSAGE

            };

        }

    } else {

        parsed =
            rawMessage;

    }


    const validation =
        validateMessage(
            parsed
        );


    if (
        !validation.valid
    ) {

        return validation;

    }


    return {

        valid: true,

        message:
            parsed

    };

}


/* ============================================================
   PLATFORM NORMALIZATION
   ============================================================ */

function normalizePlatform(
    platform
) {

    const value =
        String(
            platform ||
            "unknown"
        )
            .toLowerCase();


    if (
        value === "pc" ||
        value === "desktop"
    ) {

        return "pc";

    }


    if (
        value === "mobile" ||
        value === "phone" ||
        value === "tablet"
    ) {

        return "mobile";

    }


    if (
        value === "console"
    ) {

        return "console";

    }


    return "unknown";

}


/* ============================================================
   REQUEST ID
   ============================================================ */

function createRequestId() {

    /*
     * crypto.randomUUID() is available in modern Node.js.
     *
     * A fallback is included for compatibility.
     */

    if (
        typeof crypto.randomUUID ===
        "function"
    ) {

        return crypto.randomUUID();

    }


    return (

        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2)

    );

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    PROTOCOL_VERSION,

    MESSAGE_TYPES,

    ACTIONS,

    EVENTS,

    ERROR_CODES,

    createClientProtocol,

    createMessage,

    createHelloMessage,

    createActionMessage,

    createActivityMessage,

    createReconnectMessage,

    createStateMessage,

    createEventMessage,

    createErrorMessage,

    validateMessage,

    validateActionMessage,

    parseMessage

};
