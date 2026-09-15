```javascript
/*
 * ============================================================
 * Card Stuff Yes
 * Game Client
 * ============================================================
 *
 * Responsibilities:
 *
 * - Connect to the Card Stuff Yes server
 * - Maintain client-side game state
 * - Handle authentication/session state
 * - Handle matchmaking
 * - Handle battles
 * - Handle reconnects
 * - Convert server messages into client events
 * - Connect the universal input system to game actions
 *
 * IMPORTANT:
 *
 * The server remains authoritative.
 *
 * The client NEVER decides:
 *
 * - Whether a card may be played
 * - Whether a player owns a card
 * - Whether a resource may be spent
 * - Whether damage is valid
 * - Whether a turn is valid
 * - Whether a battle result is valid
 *
 * ============================================================
 */


/* ============================================================
   CONFIGURATION
   ============================================================ */

const GAME_CLIENT_CONFIG = Object.freeze({

    protocolVersion:
        1,

    websocketPath:
        "/ws",

    reconnectDelay:
        1000,

    reconnectMaximumDelay:
        10000,

    heartbeatInterval:
        15000,

    requestTimeout:
        10000

});


/* ============================================================
   CLIENT STATES
   ============================================================ */

const CLIENT_STATES = Object.freeze({

    DISCONNECTED:
        "disconnected",

    CONNECTING:
        "connecting",

    CONNECTED:
        "connected",

    AUTHENTICATING:
        "authenticating",

    QUEUED:
        "queued",

    MATCHED:
        "matched",

    BATTLE:
        "battle",

    RECONNECTING:
        "reconnecting",

    ERROR:
        "error"

});


/* ============================================================
   CLIENT EVENTS
   ============================================================ */

const CLIENT_EVENTS = Object.freeze({

    STATE_CHANGED:
        "state-changed",

    CONNECTED:
        "connected",

    DISCONNECTED:
        "disconnected",

    ERROR:
        "error",

    SERVER_MESSAGE:
        "server-message",

    AUTHENTICATED:
        "authenticated",

    AUTH_REQUIRED:
        "auth-required",

    QUEUED:
        "queued",

    MATCH_FOUND:
        "match-found",

    BATTLE_STARTED:
        "battle-started",

    BATTLE_UPDATED:
        "battle-updated",

    BATTLE_ENDED:
        "battle-ended",

    RECONNECTING:
        "reconnecting",

    RECONNECTED:
        "reconnected",

    CONNECTION_LOST:
        "connection-lost"

});


/* ============================================================
   CLIENT
   ============================================================ */

class CardStuffYesGameClient {

    constructor(options = {}) {

        this.config = {

            ...GAME_CLIENT_CONFIG,

            ...options

        };


        this.socket =
            null;


        this.state =
            CLIENT_STATES.DISCONNECTED;


        this.previousState =
            null;


        this.player =
            null;


        this.battle =
            null;


        this.match =
            null;


        this.server =
            null;


        this.requestCounter =
            0;


        this.pendingRequests =
            new Map();


        this.listeners =
            new Map();


        this.reconnectAttempts =
            0;


        this.reconnectTimer =
            null;


        this.heartbeatTimer =
            null;


        this.manualDisconnect =
            false;


        this.lastDisconnectReason =
            null;


        this.connectedAt =
            null;


        this.lastServerMessage =
            null;


        this.lastServerMessageAt =
            null;


        this.input =
            window.CardStuffYesInput ??
            null;


        this.inputCleanup =
            [];


        this.setupInput();

    }


    /* ========================================================
       EVENTS
       ======================================================== */

    on(event, callback) {

        if (!this.listeners.has(event)) {

            this.listeners.set(
                event,
                new Set()
            );

        }


        this.listeners
            .get(event)
            .add(callback);


        return () => {

            this.off(
                event,
                callback
            );

        };

    }


    off(event, callback) {

        const callbacks =
            this.listeners.get(event);


        if (!callbacks) {

            return;

        }


        callbacks.delete(
            callback
        );


        if (callbacks.size === 0) {

            this.listeners.delete(
                event
            );

        }

    }


    emit(event, data = {}) {

        const callbacks =
            this.listeners.get(event);


        if (!callbacks) {

            return;

        }


        for (const callback of callbacks) {

            try {

                callback(data);

            } catch (error) {

                console.error(
                    "Card Stuff Yes client event error:",
                    error
                );

            }

        }

    }


    /* ========================================================
       STATE
       ======================================================== */

    setState(nextState) {

        if (
            this.state ===
            nextState
        ) {

            return;

        }


        this.previousState =
            this.state;


        this.state =
            nextState;


        this.emit(
            CLIENT_EVENTS.STATE_CHANGED,
            {

                state:
                    nextState,

                previousState:
                    this.previousState

            }
        );

    }


    getState() {

        return this.state;

    }


    /* ========================================================
       CONNECTION
       ======================================================== */

    connect() {

        this.manualDisconnect =
            false;


        if (
            this.socket &&
            (
                this.socket.readyState ===
                WebSocket.OPEN ||

                this.socket.readyState ===
                WebSocket.CONNECTING
            )
        ) {

            return;

        }


        this.clearReconnectTimer();


        this.setState(
            CLIENT_STATES.CONNECTING
        );


        const protocol =
            location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";


        const url =
            `${protocol}//${location.host}${this.config.websocketPath}`;


        let socket;


        try {

            socket =
                new WebSocket(url);

        } catch (error) {

            this.handleConnectionError(
                error
            );

            return;

        }


        this.socket =
            socket;


        socket.addEventListener(
            "open",
            () => {

                this.handleOpen();

            }
        );


        socket.addEventListener(
            "message",
            event => {

                this.handleMessage(
                    event.data
                );

            }
        );


        socket.addEventListener(
            "close",
            event => {

                this.handleClose(
                    event
                );

            }
        );


        socket.addEventListener(
            "error",
            event => {

                this.handleSocketError(
                    event
                );

            }
        );

    }


    disconnect(reason = "manual") {

        this.manualDisconnect =
            true;


        this.clearReconnectTimer();


        this.stopHeartbeat();


        if (!this.socket) {

            this.setState(
                CLIENT_STATES.DISCONNECTED
            );

            return;

        }


        this.lastDisconnectReason =
            reason;


        try {

            this.socket.close(
                1000,
                reason
            );

        } catch (error) {

            console.warn(
                "Card Stuff Yes socket close error:",
                error
            );

        }

    }


    handleOpen() {

        this.connectedAt =
            Date.now();


        this.reconnectAttempts =
            0;


        this.setState(
            CLIENT_STATES.CONNECTED
        );


        this.emit(
            CLIENT_EVENTS.CONNECTED
        );


        this.startHeartbeat();


        this.sendHello();

    }


    handleClose(event) {

        this.stopHeartbeat();


        this.rejectPendingRequests(
            new Error(
                "Connection closed."
            )
        );


        this.socket =
            null;


        this.emit(
            CLIENT_EVENTS.DISCONNECTED,
            {

                code:
                    event.code,

                reason:
                    event.reason

            }
        );


        if (
            this.manualDisconnect
        ) {

            this.setState(
                CLIENT_STATES.DISCONNECTED
            );

            return;

        }


        this.emit(
            CLIENT_EVENTS.CONNECTION_LOST,
            {

                code:
                    event.code,

                reason:
                    event.reason

            }
        );


        this.beginReconnect();

    }


    handleSocketError(error) {

        this.emit(
            CLIENT_EVENTS.ERROR,
            {

                type:
                    "socket",

                error

            }
        );

    }


    handleConnectionError(error) {

        this.setState(
            CLIENT_STATES.ERROR
        );


        this.emit(
            CLIENT_EVENTS.ERROR,
            {

                type:
                    "connection",

                error

            }
        );


        this.beginReconnect();

    }


    /* ========================================================
       RECONNECT
       ======================================================== */

    beginReconnect() {

        if (
            this.manualDisconnect
        ) {

            return;

        }


        this.setState(
            CLIENT_STATES.RECONNECTING
        );


        this.reconnectAttempts += 1;


        const delay =
            Math.min(

                this.config.reconnectDelay *
                Math.pow(
                    2,
                    this.reconnectAttempts - 1
                ),

                this.config.reconnectMaximumDelay

            );


        this.emit(
            CLIENT_EVENTS.RECONNECTING,
            {

                attempt:
                    this.reconnectAttempts,

                delay

            }
        );


        this.clearReconnectTimer();


        this.reconnectTimer =
            setTimeout(() => {

                this.connect();

            }, delay);

    }


    clearReconnectTimer() {

        if (
            this.reconnectTimer
        ) {

            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer =
                null;

        }

    }


    /* ========================================================
       HEARTBEAT
       ======================================================== */

    startHeartbeat() {

        this.stopHeartbeat();


        this.heartbeatTimer =
            setInterval(() => {

                if (
                    !this.isConnected()
                ) {

                    return;

                }


                this.sendRaw({

                    type:
                        "ping",

                    protocolVersion:
                        this.config.protocolVersion

                });

            }, this.config.heartbeatInterval);

    }


    stopHeartbeat() {

        if (
            this.heartbeatTimer
        ) {

            clearInterval(
                this.heartbeatTimer
            );

            this.heartbeatTimer =
                null;

        }

    }


    /* ========================================================
       HELLO
       ======================================================== */

    sendHello() {

        this.sendRaw({

            type:
                "hello",

            protocolVersion:
                this.config.protocolVersion,

            client: {

                platform:
                    this.getPlatform(),

                userAgent:
                    navigator.userAgent

            }

        });

    }


    /* ========================================================
       MESSAGE HANDLING
       ======================================================== */

    handleMessage(rawMessage) {

        this.lastServerMessageAt =
            Date.now();


        let message;


        try {

            message =
                typeof rawMessage ===
                "string"

                    ? JSON.parse(
                        rawMessage
                    )

                    : rawMessage;

        } catch (error) {

            this.emit(
                CLIENT_EVENTS.ERROR,
                {

                    type:
                        "invalid-server-message",

                    error,

                    rawMessage

                }
            );

            return;

        }


        this.lastServerMessage =
            message;


        this.emit(
            CLIENT_EVENTS.SERVER_MESSAGE,
            message
        );


        if (
            message.requestId
        ) {

            this.resolvePendingRequest(
                message.requestId,
                message
            );

        }


        this.routeMessage(
            message
        );

    }


    routeMessage(message) {

        switch (message.type) {

            case "hello":

                this.handleHello(
                    message
                );

                break;


            case "auth":

                this.handleAuthMessage(
                    message
                );

                break;


            case "authenticated":

                this.handleAuthenticated(
                    message
                );

                break;


            case "auth-required":

                this.emit(
                    CLIENT_EVENTS.AUTH_REQUIRED,
                    message
                );

                break;


            case "queue":

                this.handleQueueMessage(
                    message
                );

                break;


            case "match-found":

                this.handleMatchFound(
                    message
                );

                break;


            case "battle-start":

                this.handleBattleStart(
                    message
                );

                break;


            case "battle-state":

                this.handleBattleState(
                    message
                );

                break;


            case "battle-update":

                this.handleBattleUpdate(
                    message
                );

                break;


            case "battle-end":

                this.handleBattleEnd(
                    message
                );

                break;


            case "reconnect":

                this.handleReconnectMessage(
                    message
                );

                break;


            case "error":

                this.handleServerError(
                    message
                );

                break;


            case "pong":

                break;


            default:

                this.handleUnknownMessage(
                    message
                );

                break;

        }

    }


    /* ========================================================
       SERVER HELLO
       ======================================================== */

    handleHello(message) {

        this.server =
            message.server ??
            null;


        if (
            message.authenticated
        ) {

            this.setState(
                CLIENT_STATES.AUTHENTICATING
            );

        }

    }


    /* ========================================================
       AUTH
       ======================================================== */

    handleAuthMessage(message) {

        if (
            message.authenticated
        ) {

            this.handleAuthenticated(
                message
            );

        }

    }


    handleAuthenticated(message) {

        this.player =
            message.player ??
            null;


        this.setState(
            CLIENT_STATES.CONNECTED
        );


        this.emit(
            CLIENT_EVENTS.AUTHENTICATED,
            {

                player:
                    this.player

            }
        );


        if (
            this.match
        ) {

            this.setState(
                CLIENT_STATES.MATCHED
            );

        }

    }


    /* ========================================================
       QUEUE
       ======================================================== */

    handleQueueMessage(message) {

        if (
            message.queued
        ) {

            this.setState(
                CLIENT_STATES.QUEUED
            );

        }


        this.emit(
            CLIENT_EVENTS.QUEUED,
            message
        );

    }


    /* ========================================================
       MATCH FOUND
       ======================================================== */

    handleMatchFound(message) {

        this.match =
            message.match ??
            message;


        this.setState(
            CLIENT_STATES.MATCHED
        );


        this.emit(
            CLIENT_EVENTS.MATCH_FOUND,
            {

                match:
                    this.match

            }
        );

    }


    /* ========================================================
       BATTLE START
       ======================================================== */

    handleBattleStart(message) {

        this.battle =
            message.battle ??
            message.state ??
            null;


        this.setState(
            CLIENT_STATES.BATTLE
        );


        this.emit(
            CLIENT_EVENTS.BATTLE_STARTED,
            {

                battle:
                    this.battle

            }
        );

    }


    /* ========================================================
       BATTLE STATE
       ======================================================== */

    handleBattleState(message) {

        this.battle =
            message.battle ??
            message.state ??
            this.battle;


        this.setState(
            CLIENT_STATES.BATTLE
        );


        this.emit(
            CLIENT_EVENTS.BATTLE_UPDATED,
            {

                battle:
                    this.battle,

                message

            }
        );

    }


    /* ========================================================
       BATTLE UPDATE
       ======================================================== */

    handleBattleUpdate(message) {

        this.battle =
            message.battle ??
            message.state ??
            this.battle;


        this.emit(
            CLIENT_EVENTS.BATTLE_UPDATED,
            {

                battle:
                    this.battle,

                message

            }
        );

    }


    /* ========================================================
       BATTLE END
       ======================================================== */

    handleBattleEnd(message) {

        this.battle =
            message.battle ??
            this.battle;


        this.setState(
            CLIENT_STATES.CONNECTED
        );


        this.emit(
            CLIENT_EVENTS.BATTLE_ENDED,
            {

                battle:
                    this.battle,

                result:
                    message.result ??
                    null

            }
        );


        this.battle =
            null;


        this.match =
            null;

    }


    /* ========================================================
       RECONNECT MESSAGE
       ======================================================== */

    handleReconnectMessage(message) {

        this.emit(
            CLIENT_EVENTS.RECONNECTED,
            message
        );


        if (
            message.battle
        ) {

            this.battle =
                message.battle;


            this.setState(
                CLIENT_STATES.BATTLE
            );

        }

    }


    /* ========================================================
       SERVER ERROR
       ======================================================== */

    handleServerError(message) {

        this.emit(
            CLIENT_EVENTS.ERROR,
            {

                type:
                    "server",

                code:
                    message.code ??
                    null,

                message:
                    message.message ??
                    "Server error.",

                details:
                    message

            }
        );

    }


    handleUnknownMessage(message) {

        console.warn(
            "Unknown Card Stuff Yes server message:",
            message
        );

    }


    /* ========================================================
       SEND RAW
       ======================================================== */

    sendRaw(message) {

        if (
            !this.socket ||
            this.socket.readyState !==
            WebSocket.OPEN
        ) {

            return false;

        }


        try {

            this.socket.send(
                JSON.stringify(
                    message
                )
            );


            return true;

        } catch (error) {

            this.emit(
                CLIENT_EVENTS.ERROR,
                {

                    type:
                        "send",

                    error

                }
            );


            return false;

        }

    }


    /* ========================================================
       REQUEST
       ======================================================== */

    request(type, payload = {}) {

        if (
            !this.isConnected()
        ) {

            return Promise.reject(
                new Error(
                    "Not connected to the server."
                )
            );

        }


        const requestId =
            this.createRequestId();


        const message = {

            ...payload,

            type,

            requestId,

            protocolVersion:
                this.config.protocolVersion

        };


        return new Promise(
            (resolve, reject) => {

                const timeout =
                    setTimeout(() => {

                        this.pendingRequests.delete(
                            requestId
                        );


                        reject(
                            new Error(
                                `Request timed out: ${type}`
                            )
                        );

                    }, this.config.requestTimeout);


                this.pendingRequests.set(
                    requestId,
                    {

                        resolve,

                        reject,

                        timeout

                    }
                );


                if (
                    !this.sendRaw(
                        message
                    )
                ) {

                    clearTimeout(
                        timeout
                    );


                    this.pendingRequests.delete(
                        requestId
                    );


                    reject(
                        new Error(
                            "Unable to send request."
                        )
                    );

                }

            }
        );

    }


    createRequestId() {

        this.requestCounter += 1;


        return [

            Date.now()
                .toString(36),

            this.requestCounter
                .toString(36),

            Math.random()
                .toString(36)
                .slice(2, 8)

        ].join("-");

    }


    resolvePendingRequest(
        requestId,
        message
    ) {

        const pending =
            this.pendingRequests.get(
                requestId
            );


        if (!pending) {

            return;

        }


        clearTimeout(
            pending.timeout
        );


        this.pendingRequests.delete(
            requestId
        );


        if (
            message.type ===
            "error"
        ) {

            pending.reject(
                new Error(
                    message.message ??
                    "Server request failed."
                )
            );

            return;

        }


        pending.resolve(
            message
        );

    }


    rejectPendingRequests(error) {

        for (
            const [
                requestId,
                pending
            ]
            of this.pendingRequests
        ) {

            clearTimeout(
                pending.timeout
            );


            pending.reject(
                error
            );


            this.pendingRequests.delete(
                requestId
            );

        }

    }


    /* ========================================================
       GAME ACTIONS
       ======================================================== */

    queueForBattle() {

        return this.request(
            "queue",
            {

                action:
                    "join"

            }
        );

    }


    leaveQueue() {

        return this.request(
            "queue",
            {

                action:
                    "leave"

            }
        );

    }


    playCard(cardId) {

        return this.sendGameAction(
            "playCard",
            {

                cardId

            }
        );

    }


    useAbility(
        cardId,
        abilityId,
        target = null
    ) {

        return this.sendGameAction(
            "useAbility",
            {

                cardId,

                abilityId,

                target

            }
        );

    }


    endTurn() {

        return this.sendGameAction(
            "endTurn"
        );

    }


    drawCard() {

        return this.sendGameAction(
            "draw"
        );

    }


    discardCard(cardId) {

        return this.sendGameAction(
            "discard",
            {

                cardId

            }
        );

    }


    pass() {

        return this.sendGameAction(
            "pass"
        );

    }


    sendGameAction(
        action,
        payload = {}
    ) {

        return this.request(
            "game-action",
            {

                action,

                ...payload

            }
        );

    }


    /* ========================================================
       INPUT
       ======================================================== */

    setupInput() {

        if (!this.input) {

            return;

        }


        this.inputCleanup.push(

            this.input.on(
                "up",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.UP,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "down",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.DOWN,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "left",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.LEFT,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "right",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.RIGHT,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "select",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.SELECT,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "back",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.BACK,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "context",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.CONTEXT,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "info",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.INFO,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "previous",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.PREVIOUS,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "next",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.NEXT,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "zoom",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.ZOOM,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "primary",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.PRIMARY,
                        event
                    );

                }
            )

        );


        this.inputCleanup.push(

            this.input.on(
                "menu",
                event => {

                    this.handleInput(
                        INPUT_ACTIONS.MENU,
                        event
                    );

                }
            )

        );

    }


    handleInput(action, event) {

        this.emit(
            `input:${action}`,
            event
        );


        /*
         * The game UI will consume these actions.
         *
         * We deliberately do NOT automatically turn SELECT
         * into playCard(), because the UI must first determine
         * which card/action is currently selected.
         */

    }


    /* ========================================================
       PLATFORM
       ======================================================== */

    getPlatform() {

        if (
            this.input &&
            this.input.isGamepadConnected()
        ) {

            return "controller";

        }


        if (
            "ontouchstart"
            in window
        ) {

            return "touch";

        }


        return "desktop";

    }


    /* ========================================================
       STATUS
       ======================================================== */

    isConnected() {

        return Boolean(

            this.socket &&
            this.socket.readyState ===
            WebSocket.OPEN

        );

    }


    isInBattle() {

        return Boolean(
            this.battle
        );

    }


    isAuthenticated() {

        return Boolean(
            this.player
        );

    }


    getPlayer() {

        return this.player;

    }


    getBattle() {

        return this.battle;

    }


    getMatch() {

        return this.match;

    }


    getServerInfo() {

        return this.server;

    }


    getConnectionInfo() {

        return {

            state:
                this.state,

            connected:
                this.isConnected(),

            reconnectAttempts:
                this.reconnectAttempts,

            connectedAt:
                this.connectedAt,

            lastServerMessageAt:
                this.lastServerMessageAt

        };

    }


    /* ========================================================
       CLEANUP
       ======================================================== */

    destroy() {

        this.disconnect(
            "client-destroyed"
        );


        for (
            const cleanup
            of this.inputCleanup
        ) {

            try {

                cleanup();

            } catch {

                // Ignore cleanup errors.

            }

        }


        this.inputCleanup =
            [];


        this.listeners.clear();

    }

}


/* ============================================================
   GLOBAL CLIENT
   ============================================================ */

window.CardStuffYesGameClient =
    CardStuffYesGameClient;


window.CardStuffYesClientStates =
    CLIENT_STATES;


window.CardStuffYesClientEvents =
    CLIENT_EVENTS;


/*
 * The page can use this directly:
 *
 * window.cardStuffYesGameClient
 */

window.cardStuffYesGameClient =
    new CardStuffYesGameClient();
```
