/*
 * ============================================================
 * Card Stuff Yes
 * Battle State
 * ============================================================
 *
 * This module stores the complete runtime state of a battle.
 *
 * It is the central state container between:
 *
 *     Battle
 *       ↓
 *     Battle State
 *       ↓
 *     Turn System
 *       ↓
 *     Game Actions
 *       ↓
 *     Card Rules / Resources / Effects
 *
 * ============================================================
 *
 * A battle state contains:
 *
 * - Battle ID
 * - Players
 * - Decks
 * - Hands
 * - Cards in play
 * - Discard pile
 * - Resources
 * - Turn information
 * - Status effects
 * - Battle status
 * - Winner information
 *
 * ============================================================
 *
 * IMPORTANT:
 *
 * This is SERVER-SIDE state.
 *
 * The client receives a safe snapshot of this state.
 *
 * The client must never be trusted to decide:
 *
 * - whose turn it is
 * - how much HP a card has
 * - how many resources a player owns
 * - which cards are in a deck
 * - whether an ability can be used
 *
 * ============================================================
 */


/* ============================================================
   DEFAULT SETTINGS
   ============================================================ */

const DEFAULT_SETTINGS = {

    /*
     * Normal deck size.
     */
    deckSize: 60,

    /*
     * Maximum hand size.
     *
     * This is configurable because the final game rules may
     * change this later.
     */
    maxHandSize: 60,

    /*
     * Maximum cards a player can have in play.
     */
    maxCardsInPlay: 20,

    /*
     * Default card HP.
     */
    defaultCardHP: 100

};


/* ============================================================
   BATTLE STATUS VALUES
   ============================================================ */

const BATTLE_STATUS = {

    WAITING:
        "waiting",

    ACTIVE:
        "active",

    ENDED:
        "ended",

    ABANDONED:
        "abandoned"

};


/* ============================================================
   BATTLE STATE FACTORY
   ============================================================ */

function createBattleState(options = {}) {

    const settings = {

        ...DEFAULT_SETTINGS,

        ...(options.settings || {})

    };


    /*
     * Optional resource system.
     */
    const resources =
        options.resourceSystem ||
        options.resources ||
        null;


    /*
     * Optional card-rules module.
     */
    const cardRules =
        options.cardRules ||
        null;


    /*
     * Store active battles.
     *
     * battleId -> battle state
     */
    const states =
        new Map();


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function normalizeBattleId(
        battleId
    ) {

        return String(
            battleId
        );

    }


    function normalizePlayerId(
        playerId
    ) {

        return String(
            playerId
        );

    }


    function now() {

        return Date.now();

    }


    /* ========================================================
       CREATE EMPTY PLAYER STATE
       ======================================================== */

    /*
     * Creates the portion of the battle state belonging to
     * one player.
     */
    function createPlayerState(
        playerId,
        supplied = {}
    ) {

        const id =
            normalizePlayerId(
                playerId
            );


        /*
         * Create a resource pool.
         */
        let playerResources = {};


        if (
            resources &&
            typeof resources.createPool ===
            "function"
        ) {

            playerResources =
                resources.createPool(
                    supplied.resources || {}
                );

        } else {

            playerResources = {

                ...(supplied.resources || {})

            };

        }


        return {

            /*
             * Player identifier.
             */
            playerId:
                id,


            /*
             * Cards remaining in the player's deck.
             */
            deck:
                Array.isArray(
                    supplied.deck
                )
                    ? [...supplied.deck]
                    : [],


            /*
             * Cards currently in the player's hand.
             */
            hand:
                Array.isArray(
                    supplied.hand
                )
                    ? [...supplied.hand]
                    : [],


            /*
             * Runtime card instances currently in play.
             */
            inPlay:
                Array.isArray(
                    supplied.inPlay
                )
                    ? [...supplied.inPlay]
                    : [],


            /*
             * Player-specific discard pile.
             *
             * The game can also use the global discard pile
             * if desired.
             */
            discard:
                Array.isArray(
                    supplied.discard
                )
                    ? [...supplied.discard]
                    : [],


            /*
             * Player resources.
             */
            resources:
                playerResources,


            /*
             * Player-level status effects.
             */
            statusEffects:
                Array.isArray(
                    supplied.statusEffects
                )
                    ? [...supplied.statusEffects]
                    : [],


            /*
             * Whether this player has been eliminated.
             */
            eliminated:
                Boolean(
                    supplied.eliminated
                ),


            /*
             * Whether this player has disconnected.
             */
            disconnected:
                Boolean(
                    supplied.disconnected
                ),


            /*
             * Time at which the player disconnected.
             *
             * Used by the reconnect system later.
             */
            disconnectedAt:
                supplied.disconnectedAt ??
                null,


            /*
             * Additional extensible data.
             */
            data:
                supplied.data &&
                typeof supplied.data ===
                "object"

                    ? {
                        ...supplied.data
                    }

                    : {}

        };

    }


    /* ========================================================
       CREATE BATTLE
       ======================================================== */

    function create(
        battleId,
        playerIds = [],
        supplied = {}
    ) {

        const id =
            normalizeBattleId(
                battleId
            );


        if (
            states.has(id)
        ) {

            return {

                success: false,

                error:
                    "BATTLE_ALREADY_EXISTS"

            };

        }


        /*
         * Normalize and deduplicate players.
         */
        const normalizedPlayers =
            Array.from(

                new Set(

                    playerIds
                        .map(
                            normalizePlayerId
                        )

                )

            );


        /*
         * Create player state objects.
         */
        const players = {};


        for (
            const playerId
            of normalizedPlayers
        ) {

            players[playerId] =
                createPlayerState(

                    playerId,

                    supplied.players?.[
                        playerId
                    ] || {}

                );

        }


        const timestamp =
            now();


        const state = {

            /*
             * Battle identifier.
             */
            battleId:
                id,


            /*
             * Battle status.
             */
            status:
                supplied.status ||
                BATTLE_STATUS.WAITING,


            /*
             * Player IDs in turn order.
             */
            playerIds:
                normalizedPlayers,


            /*
             * Complete player state.
             */
            players,


            /*
             * Current turn information.
             *
             * turn-system.js is authoritative for actual
             * turn progression.
             */
            currentTurn:
                supplied.currentTurn ||
                null,


            /*
             * Global discard pile.
             *
             * Some cards may be moved here instead of a
             * player-specific discard pile.
             */
            discard:
                Array.isArray(
                    supplied.discard
                )
                    ? [...supplied.discard]
                    : [],


            /*
             * Effects currently waiting to resolve.
             */
            pendingEffects:
                Array.isArray(
                    supplied.pendingEffects
                )
                    ? [...supplied.pendingEffects]
                    : [],


            /*
             * Battle event history.
             *
             * This can later be limited to prevent memory
             * growth during very long battles.
             */
            events:
                Array.isArray(
                    supplied.events
                )
                    ? [...supplied.events]
                    : [],


            /*
             * Winner.
             */
            winnerId:
                supplied.winnerId ??
                null,


            /*
             * Reason the battle ended.
             */
            endReason:
                supplied.endReason ??
                null,


            /*
             * Creation time.
             */
            createdAt:
                supplied.createdAt ||
                timestamp,


            /*
             * Last state modification.
             */
            updatedAt:
                timestamp,


            /*
             * Extensible battle metadata.
             */
            data:
                supplied.data &&
                typeof supplied.data ===
                "object"

                    ? {
                        ...supplied.data
                    }

                    : {}

        };


        states.set(
            id,
            state
        );


        return {

            success: true,

            state

        };

    }


    /* ========================================================
       GET BATTLE STATE
       ======================================================== */

    function get(
        battleId
    ) {

        return states.get(

            normalizeBattleId(
                battleId
            )

        ) || null;

    }


    /* ========================================================
       DELETE BATTLE STATE
       ======================================================== */

    function remove(
        battleId
    ) {

        return states.delete(

            normalizeBattleId(
                battleId
            )

        );

    }


    /* ========================================================
       CHECK EXISTENCE
       ======================================================== */

    function has(
        battleId
    ) {

        return states.has(

            normalizeBattleId(
                battleId
            )

        );

    }


    /* ========================================================
       PLAYER LOOKUP
       ======================================================== */

    function getPlayer(
        battleId,
        playerId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return null;

        }


        return (

            state.players[
                normalizePlayerId(
                    playerId
                )
            ] ||

            null

        );

    }


    /* ========================================================
       ADD PLAYER
       ======================================================== */

    function addPlayer(
        battleId,
        playerId,
        supplied = {}
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        const id =
            normalizePlayerId(
                playerId
            );


        if (
            state.players[id]
        ) {

            return {

                success: false,

                error:
                    "PLAYER_ALREADY_IN_BATTLE"

            };

        }


        state.playerIds.push(
            id
        );


        state.players[id] =
            createPlayerState(

                id,

                supplied

            );


        touch(
            state
        );


        return {

            success: true,

            player:
                state.players[id]

        };

    }


    /* ========================================================
       REMOVE PLAYER
       ======================================================== */

    function removePlayer(
        battleId,
        playerId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        const id =
            normalizePlayerId(
                playerId
            );


        if (
            !state.players[id]
        ) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        delete state.players[id];


        state.playerIds =
            state.playerIds.filter(

                playerId =>
                    String(
                        playerId
                    ) !== id

            );


        touch(
            state
        );


        return {

            success: true

        };

    }


    /* ========================================================
       DECK
       ======================================================== */

    function setDeck(
        battleId,
        playerId,
        deck
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                deck
            )
        ) {

            return {

                success: false,

                error:
                    "INVALID_DECK"

            };

        }


        player.deck =
            [...deck];


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            deck:
                player.deck

        };

    }


    function getDeck(
        battleId,
        playerId
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return null;

        }


        return player.deck;

    }


    /* ========================================================
       HAND
       ======================================================== */

    function getHand(
        battleId,
        playerId
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return null;

        }


        return player.hand;

    }


    function addToHand(
        battleId,
        playerId,
        card
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            player.hand.length >=
            settings.maxHandSize
        ) {

            return {

                success: false,

                error:
                    "HAND_FULL"

            };

        }


        player.hand.push(
            card
        );


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            card

        };

    }


    function removeFromHand(
        battleId,
        playerId,
        index
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        const cardIndex =
            Number(
                index
            );


        if (
            !Number.isInteger(
                cardIndex
            ) ||
            cardIndex < 0 ||
            cardIndex >=
                player.hand.length
        ) {

            return {

                success: false,

                error:
                    "INVALID_CARD_INDEX"

            };

        }


        const card =
            player.hand.splice(

                cardIndex,

                1

            )[0];


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            card

        };

    }


    /* ========================================================
       IN-PLAY CARDS
       ======================================================== */

    function getInPlay(
        battleId,
        playerId
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return null;

        }


        return player.inPlay;

    }


    function addInPlay(
        battleId,
        playerId,
        card
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            player.inPlay.length >=
            settings.maxCardsInPlay
        ) {

            return {

                success: false,

                error:
                    "BOARD_FULL"

            };

        }


        player.inPlay.push(
            card
        );


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            card

        };

    }


    /*
     * Finds a specific runtime card.
     */
    function findCard(
        battleId,
        instanceId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return null;

        }


        for (
            const playerId
            of state.playerIds
        ) {

            const player =
                state.players[playerId];


            if (!player) {

                continue;

            }


            const card =
                player.inPlay.find(

                    item =>
                        String(
                            item.instanceId
                        ) ===
                        String(
                            instanceId
                        )

                );


            if (card) {

                return {

                    card,

                    playerId:
                        String(
                            playerId
                        )

                };

            }

        }


        return null;

    }


    /* ========================================================
       REMOVE IN-PLAY CARD
       ======================================================== */

    function removeInPlay(
        battleId,
        playerId,
        instanceId
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        const index =
            player.inPlay.findIndex(

                card =>
                    String(
                        card.instanceId
                    ) ===
                    String(
                        instanceId
                    )

            );


        if (
            index === -1
        ) {

            return {

                success: false,

                error:
                    "CARD_NOT_IN_PLAY"

            };

        }


        const card =
            player.inPlay.splice(

                index,

                1

            )[0];


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            card

        };

    }


    /* ========================================================
       DISCARD
       ======================================================== */

    function discardCard(
        battleId,
        playerId,
        card,
        options = {}
    ) {

        const state =
            get(
                battleId
            );


        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!state || !player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        /*
         * Default to player-specific discard.
         */
        if (
            options.global
        ) {

            state.discard.push(
                card
            );

        } else {

            player.discard.push(
                card
            );

        }


        /*
         * Discarding a card grants Dark Magik.
         */
        if (
            resources
        ) {

            if (
                typeof resources.onCardDiscarded ===
                "function"
            ) {

                resources.onCardDiscarded(

                    player.resources

                );

            }

        }


        touch(
            state
        );


        return {

            success: true,

            card

        };

    }


    /* ========================================================
       DRAW
       ======================================================== */

    function drawCard(
        battleId,
        playerId
    ) {

        const state =
            get(
                battleId
            );


        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!state || !player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            player.deck.length ===
            0
        ) {

            return {

                success: false,

                error:
                    "DECK_EMPTY"

            };

        }


        if (
            player.hand.length >=
            settings.maxHandSize
        ) {

            return {

                success: false,

                error:
                    "HAND_FULL"

            };

        }


        const card =
            player.deck.shift();


        player.hand.push(
            card
        );


        /*
         * Drawing grants Magik.
         */
        if (
            resources &&
            typeof resources.onCardDraw ===
            "function"
        ) {

            resources.onCardDraw(

                player.resources

            );

        }


        touch(
            state
        );


        return {

            success: true,

            card

        };

    }


    /* ========================================================
       PLAY CARD
       ======================================================== */

    function playCard(
        battleId,
        playerId,
        cardDefinition
    ) {

        const state =
            get(
                battleId
            );


        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!state || !player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        /*
         * Locate the card in the player's hand.
         */
        const cardId =
            String(

                cardDefinition?.id ??
                cardDefinition?.cardId

            );


        const handIndex =
            player.hand.findIndex(

                card => {

                    const id =
                        typeof card ===
                        "string"

                            ? card

                            : card?.id ??
                              card?.cardId;

                    return (
                        String(id) ===
                        cardId
                    );

                }

            );


        if (
            handIndex === -1
        ) {

            return {

                success: false,

                error:
                    "CARD_NOT_IN_HAND"

            };

        }


        if (
            player.inPlay.length >=
            settings.maxCardsInPlay
        ) {

            return {

                success: false,

                error:
                    "BOARD_FULL"

            };

        }


        const originalCard =
            player.hand.splice(

                handIndex,

                1

            )[0];


        let runtimeCard = null;


        /*
         * Use card-rules runtime instance creation if
         * available.
         */
        if (
            cardRules &&
            typeof cardRules.createCardInstance ===
            "function"
        ) {

            runtimeCard =
                cardRules.createCardInstance(

                    typeof originalCard ===
                    "object"

                        ? originalCard

                        : cardDefinition,

                    playerId

                );

        } else {

            /*
             * Fallback runtime representation.
             */
            runtimeCard = {

                instanceId:
                    `${cardId}-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,

                cardId,

                ownerId:
                    String(
                        playerId
                    ),

                name:
                    cardDefinition?.name ||
                    cardId,

                hp:
                    Number(
                        cardDefinition?.hp
                    ) || settings.defaultCardHP,

                maxHP:
                    Number(
                        cardDefinition?.hp
                    ) || settings.defaultCardHP,

                power:
                    Number(
                        cardDefinition?.power
                    ) || 0,

                abilities:
                    Array.isArray(
                        cardDefinition?.abilities
                    )
                        ? cardDefinition.abilities
                        : [],

                inPlay: true,

                defeated: false,

                statusEffects: []

            };

        }


        if (!runtimeCard) {

            /*
             * Restore the original card if instance creation
             * failed.
             */
            player.hand.splice(

                handIndex,

                0,

                originalCard

            );


            return {

                success: false,

                error:
                    "CARD_INSTANCE_FAILED"

            };

        }


        runtimeCard.inPlay = true;


        player.inPlay.push(
            runtimeCard
        );


        /*
         * Playing a card grants Astral Magik.
         */
        if (
            resources &&
            typeof resources.onCardPlayed ===
            "function"
        ) {

            resources.onCardPlayed(

                player.resources

            );

        }


        touch(
            state
        );


        return {

            success: true,

            card:
                runtimeCard

        };

    }


    /* ========================================================
       RESOURCE ACCESS
       ======================================================== */

    function getResources(
        battleId,
        playerId
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return null;

        }


        return player.resources;

    }


    /* ========================================================
       SET RESOURCE
       ======================================================== */

    function setResource(
        battleId,
        playerId,
        resourceName,
        amount
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            resources &&
            typeof resources.set ===
            "function"
        ) {

            const result =
                resources.set(

                    player.resources,

                    resourceName,

                    amount

                );


            touch(
                get(
                    battleId
                )
            );


            return result;

        }


        player.resources[
            String(
                resourceName
            )
        ] =
            Math.max(

                0,

                Number(
                    amount
                ) || 0

            );


        touch(
            get(
                battleId
            )
        );


        return {

            success: true

        };

    }


    /* ========================================================
       ADD RESOURCE
       ======================================================== */

    function addResource(
        battleId,
        playerId,
        resourceName,
        amount,
        metadata = {}
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        let result;


        if (
            resources &&
            typeof resources.add ===
            "function"
        ) {

            result =
                resources.add(

                    player.resources,

                    resourceName,

                    amount,

                    metadata

                );

        } else {

            const name =
                String(
                    resourceName
                );


            const previous =
                Number(
                    player.resources[name]
                ) || 0;


            const value =
                Math.max(

                    0,

                    Number(
                        amount
                    ) || 0

                );


            player.resources[name] =
                previous +
                value;


            result = {

                success: true,

                resource:
                    name,

                previousAmount:
                    previous,

                amount:
                    player.resources[name],

                change:
                    value

            };

        }


        touch(
            get(
                battleId
            )
        );


        return result;

    }


    /* ========================================================
       SPEND RESOURCES
       ======================================================== */

    function spendResources(
        battleId,
        playerId,
        requirements,
        metadata = {}
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            !resources ||
            typeof resources.spend !==
            "function"
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_SYSTEM_NOT_AVAILABLE"

            };

        }


        const result =
            resources.spend(

                player.resources,

                requirements,

                metadata

            );


        if (
            result.success
        ) {

            touch(
                get(
                    battleId
                )
            );

        }


        return result;

    }


    /* ========================================================
       STATUS EFFECTS
       ======================================================== */

    function addStatusEffect(
        battleId,
        playerId,
        statusEffect
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                player.statusEffects
            )
        ) {

            player.statusEffects =
                [];

        }


        player.statusEffects.push(
            statusEffect
        );


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            statusEffect

        };

    }


    /* ========================================================
       BATTLE STATUS
       ======================================================== */

    function setStatus(
        battleId,
        status
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        state.status =
            status;


        touch(
            state
        );


        return {

            success: true,

            status

        };

    }


    /* ========================================================
       START BATTLE
       ======================================================== */

    function startBattle(
        battleId
    ) {

        return setStatus(

            battleId,

            BATTLE_STATUS.ACTIVE

        );

    }


    /* ========================================================
       END BATTLE
       ======================================================== */

    function endBattle(
        battleId,
        winnerId = null,
        reason = "normal"
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        state.status =
            BATTLE_STATUS.ENDED;


        state.winnerId =
            winnerId == null
                ? null
                : String(
                    winnerId
                );


        state.endReason =
            reason;


        touch(
            state
        );


        return {

            success: true,

            winnerId:
                state.winnerId,

            reason

        };

    }


    /* ========================================================
       ELIMINATION
       ======================================================== */

    function eliminatePlayer(
        battleId,
        playerId,
        reason = "eliminated"
    ) {

        const player =
            getPlayer(
                battleId,
                playerId
            );


        if (!player) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        player.eliminated =
            true;


        /*
         * A player's in-play cards are marked defeated.
         *
         * The exact removal/discard rules can be handled by
         * the effect/card system later.
         */
        for (
            const card
            of player.inPlay
        ) {

            card.defeated =
                true;

        }


        touch(
            get(
                battleId
            )
        );


        return {

            success: true,

            playerId:
                String(
                    playerId
                ),

            reason

        };

    }


    /* ========================================================
       CHECK ACTIVE PLAYERS
       ======================================================== */

    function getActivePlayers(
        battleId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return [];

        }


        return state.playerIds.filter(

            playerId => {

                const player =
                    state.players[
                        playerId
                    ];


                return (
                    player &&
                    !player.eliminated
                );

            }

        );

    }


    /* ========================================================
       CHECK WINNER
       ======================================================== */

    /*
     * This does NOT decide the game's victory condition by
     * itself.
     *
     * It simply detects the common case where one player
     * remains active.
     */
    function checkForWinner(
        battleId
    ) {

        const activePlayers =
            getActivePlayers(
                battleId
            );


        if (
            activePlayers.length !==
            1
        ) {

            return {

                hasWinner: false,

                winnerId: null

            };

        }


        return {

            hasWinner: true,

            winnerId:
                activePlayers[0]

        };

    }


    /* ========================================================
       EVENT HISTORY
       ======================================================== */

    function addEvent(
        battleId,
        event
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        state.events.push({

            ...event,

            timestamp:
                event.timestamp ||
                now()

        });


        /*
         * Prevent an accidental infinite memory leak.
         *
         * This limit can be increased later if battle
         * replays require a longer history.
         */
        if (
            state.events.length >
            1000
        ) {

            state.events.splice(

                0,

                state.events.length -
                1000

            );

        }


        touch(
            state
        );


        return {

            success: true

        };

    }


    /* ========================================================
       PENDING EFFECTS
       ======================================================== */

    function queueEffect(
        battleId,
        effect
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        state.pendingEffects.push(
            effect
        );


        touch(
            state
        );


        return {

            success: true,

            effect

        };

    }


    function popEffect(
        battleId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return null;

        }


        const effect =
            state.pendingEffects.shift();


        if (
            effect
        ) {

            touch(
                state
            );

        }


        return effect ||
            null;

    }


    /* ========================================================
       TOUCH STATE
       ======================================================== */

    function touch(
        state
    ) {

        if (!state) {

            return;

        }


        state.updatedAt =
            now();

    }


    /* ========================================================
       STATE SNAPSHOT
       ======================================================== */

    /*
     * Creates a safe state representation for a specific
     * player.
     *
     * A player's opponent should NOT receive hidden cards
     * from their deck or hand.
     */
    function createPlayerSnapshot(
        state,
        viewerPlayerId
    ) {

        const viewerId =
            viewerPlayerId == null
                ? null
                : String(
                    viewerPlayerId
                );


        const snapshot = {

            battleId:
                state.battleId,

            status:
                state.status,

            playerIds:
                [...state.playerIds],

            currentTurn:
                state.currentTurn
                    ? {
                        ...state.currentTurn
                    }
                    : null,

            players: {},

            discard:
                [...state.discard],

            winnerId:
                state.winnerId,

            endReason:
                state.endReason,

            createdAt:
                state.createdAt,

            updatedAt:
                state.updatedAt

        };


        /*
         * Build each player's public state.
         */
        for (
            const playerId
            of state.playerIds
        ) {

            const player =
                state.players[playerId];


            if (!player) {

                continue;

            }


            const isViewer =
                viewerId != null &&
                String(
                    playerId
                ) ===
                viewerId;


            snapshot.players[playerId] = {

                playerId:
                    player.playerId,

                /*
                 * The viewer gets their real hand.
                 *
                 * Opponents only reveal hand size.
                 */
                hand:
                    isViewer

                        ? [...player.hand]

                        : {

                            count:
                                player.hand.length

                        },


                /*
                 * Deck contents are ALWAYS hidden.
                 *
                 * Even the owner should not receive the full
                 * remaining deck through the normal snapshot.
                 */
                deckCount:
                    player.deck.length,


                /*
                 * In-play cards are public.
                 */
                inPlay:
                    player.inPlay.map(

                        card =>
                            ({
                                ...card,

                                /*
                                 * Defensive copy of nested
                                 * status effects.
                                 */
                                statusEffects:
                                    Array.isArray(
                                        card.statusEffects
                                    )

                                        ? card.statusEffects.map(
                                            status => ({
                                                ...status
                                            })
                                        )

                                        : []

                            })

                    ),


                /*
                 * Discarded cards are public.
                 */
                discard:
                    [...player.discard],


                /*
                 * Resources are normally public in this
                 * game because opponents need to know whether
                 * abilities may be possible.
                 */
                resources:
                    resources &&
                    typeof resources.snapshot ===
                    "function"

                        ? resources.snapshot(
                            player.resources
                        )

                        : {
                            ...player.resources
                        },


                statusEffects:
                    player.statusEffects.map(

                        status => ({
                            ...status
                        })

                    ),


                eliminated:
                    player.eliminated,

                disconnected:
                    player.disconnected

            };

        }


        return snapshot;

    }


    /* ========================================================
       FULL SERVER SNAPSHOT
       ======================================================== */

    /*
     * Used internally.
     *
     * This contains everything and MUST NOT be sent directly
     * to an untrusted client.
     */
    function createServerSnapshot(
        battleId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return null;

        }


        return {

            ...state,

            playerIds:
                [...state.playerIds],

            players:
                Object.fromEntries(

                    Object.entries(
                        state.players
                    )
                        .map(
                            ([id, player]) => [

                                id,

                                {

                                    ...player,

                                    deck:
                                        [
                                            ...player.deck
                                        ],

                                    hand:
                                        [
                                            ...player.hand
                                        ],

                                    inPlay:
                                        [
                                            ...player.inPlay
                                        ],

                                    discard:
                                        [
                                            ...player.discard
                                        ],

                                    resources:
                                        {
                                            ...player.resources
                                        },

                                    statusEffects:
                                        [
                                            ...player.statusEffects
                                        ]

                                }

                            ]
                        )

                ),

            discard:
                [...state.discard],

            pendingEffects:
                [...state.pendingEffects],

            events:
                [...state.events]

        };

    }


    /* ========================================================
       RESET BATTLE
       ======================================================== */

    function reset(
        battleId
    ) {

        const state =
            get(
                battleId
            );


        if (!state) {

            return {

                success: false,

                error:
                    "BATTLE_NOT_FOUND"

            };

        }


        for (
            const playerId
            of state.playerIds
        ) {

            state.players[playerId] =
                createPlayerState(
                    playerId
                );

        }


        state.currentTurn =
            null;

        state.discard =
            [];

        state.pendingEffects =
            [];

        state.events =
            [];

        state.winnerId =
            null;

        state.endReason =
            null;

        state.status =
            BATTLE_STATUS.WAITING;


        touch(
            state
        );


        return {

            success: true,

            state

        };

    }


    /* ========================================================
       LIST BATTLES
       ======================================================== */

    function list() {

        return Array.from(
            states.values()
        );

    }


    function listActive() {

        return list().filter(

            state =>
                state.status ===
                BATTLE_STATUS.ACTIVE

        );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        settings,

        BATTLE_STATUS,

        create,

        get,

        remove,

        has,

        getPlayer,

        addPlayer,

        removePlayer,

        setDeck,

        getDeck,

        getHand,

        addToHand,

        removeFromHand,

        getInPlay,

        addInPlay,

        findCard,

        removeInPlay,

        discardCard,

        drawCard,

        playCard,

        getResources,

        setResource,

        addResource,

        spendResources,

        addStatusEffect,

        setStatus,

        startBattle,

        endBattle,

        eliminatePlayer,

        getActivePlayers,

        checkForWinner,

        addEvent,

        queueEffect,

        popEffect,

        createPlayerSnapshot,

        createServerSnapshot,

        reset,

        list,

        listActive

    };

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createBattleState,

    BATTLE_STATUS,

    DEFAULT_SETTINGS

};
