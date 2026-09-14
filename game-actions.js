/*
 * ============================================================
 * Card Stuff Yes
 * Game Actions Module
 * ============================================================
 *
 * This module is the SERVER-AUTHORITATIVE action layer.
 *
 * Clients can REQUEST actions.
 *
 * Clients cannot decide whether those actions are legal.
 *
 *
 * Example:
 *
 * Client:
 *
 *     "Use ability ability-1"
 *
 *
 * Server:
 *
 *     1. Is the player authenticated?
 *     2. Are they in this battle?
 *     3. Is the battle active?
 *     4. Is it their turn?
 *     5. Does the card exist?
 *     6. Is the card theirs?
 *     7. Is the card actually in play?
 *     8. Does the ability exist?
 *     9. Are its conditions satisfied?
 *     10. Do they have enough resources?
 *     11. Spend the resources.
 *     12. Execute the ability.
 *     13. Update game state.
 *
 *
 * This module intentionally depends on interfaces rather than
 * hardcoding the entire battle system.
 *
 * That makes it possible to expand the game later without
 * rewriting the protocol.
 *
 *
 * ============================================================
 */


/* ============================================================
   DEFAULT CONFIGURATION
   ============================================================ */

const DEFAULTS = Object.freeze({

    /*
     * Maximum number of cards a player can have in a hand.
     *
     * This is NOT the deck size.
     */

    maxHandSize: 60,

    /*
     * Maximum number of cards that can be in play.
     *
     * This can be changed later if the game gets a board limit.
     */

    maxCardsInPlay: 20

});


/* ============================================================
   createGameActions
   ============================================================ */

function createGameActions(options = {}) {

    /*
     * Required dependencies.
     *
     * These are passed in by server.js.
     */

    const gameState =
        options.gameState;


    const battles =
        options.battles;


    const cardRules =
        options.cardRules ||
        null;


    const turnSystem =
        options.turnSystem ||
        null;


    const eventBus =
        options.eventBus ||
        null;


    const defaults = {

        ...DEFAULTS,

        ...(options.defaults || {})

    };


    /*
     * Public API.
     */

    return {

        handleAction,

        playCard,

        useAbility,

        endTurn,

        drawCard,

        discardCard,

        pass,

        recordActivity,

        validatePlayerInBattle,

        getActionContext

    };


    /* ========================================================
       handleAction
       ======================================================== */

    /*
     * Main entry point.
     *
     * client-protocol.js tells us that the message is
     * structurally valid.
     *
     * This function decides whether the requested action is
     * actually allowed.
     */

    async function handleAction(
        playerId,
        battleId,
        action,
        data = {}
    ) {

        const context =
            getActionContext(
                playerId,
                battleId
            );


        if (
            !context.valid
        ) {

            return failure(
                context.code,
                context.error
            );

        }


        /*
         * Every action is routed through a dedicated handler.
         */

        switch (action) {

            case "playCard":

                return playCard(
                    context,
                    data
                );


            case "useAbility":

                return useAbility(
                    context,
                    data
                );


            case "endTurn":

                return endTurn(
                    context
                );


            case "drawCard":

                return drawCard(
                    context
                );


            case "discardCard":

                return discardCard(
                    context,
                    data
                );


            case "pass":

                return pass(
                    context
                );


            case "activity":

                return recordActivity(
                    context
                );


            case "reconnect":

                /*
                 * Reconnection itself is handled by the
                 * presence/battle layer.
                 */

                return failure(
                    "ACTION_NOT_ALLOWED",
                    "Reconnect must be handled by the reconnect system."
                );


            default:

                return failure(
                    "INVALID_ACTION",
                    `Unknown game action: ${action}`
                );

        }

    }


    /* ========================================================
       getActionContext
       ======================================================== */

    /*
     * Builds the common server-side context required by nearly
     * every game action.
     */

    function getActionContext(
        playerId,
        battleId
    ) {

        if (
            playerId === null ||
            playerId === undefined
        ) {

            return {

                valid: false,

                code:
                    "NOT_AUTHENTICATED",

                error:
                    "The player is not authenticated."

            };

        }


        if (
            !battleId
        ) {

            return {

                valid: false,

                code:
                    "NOT_IN_GAME",

                error:
                    "No battle was supplied."

            };

        }


        /*
         * The battles module may expose getBattle().
         *
         * We intentionally support the current module design
         * as well as a future expanded one.
         */

        let battle = null;


        if (
            battles &&
            typeof battles.getBattle === "function"
        ) {

            battle =
                battles.getBattle(
                    battleId
                );

        } else if (
            battles &&
            battles.battles &&
            typeof battles.battles.get === "function"
        ) {

            battle =
                battles.battles.get(
                    battleId
                );

        }


        if (
            !battle
        ) {

            return {

                valid: false,

                code:
                    "GAME_NOT_ACTIVE",

                error:
                    "Battle does not exist."

            };

        }


        if (
            battle.active === false ||
            battle.status === "ended"
        ) {

            return {

                valid: false,

                code:
                    "GAME_NOT_ACTIVE",

                error:
                    "This battle is no longer active."

            };

        }


        /*
         * Verify that the player is actually part of this
         * battle.
         */

        const playerInBattle =
            isPlayerInBattle(
                battle,
                playerId
            );


        if (
            !playerInBattle
        ) {

            return {

                valid: false,

                code:
                    "NOT_IN_GAME",

                error:
                    "The player is not part of this battle."

            };

        }


        /*
         * Retrieve game state.
         */

        let state = null;


        if (
            gameState &&
            typeof gameState.getState === "function"
        ) {

            state =
                gameState.getState(
                    battleId
                );

        }


        if (
            !state
        ) {

            return {

                valid: false,

                code:
                    "GAME_NOT_ACTIVE",

                error:
                    "Game state is unavailable."

            };

        }


        return {

            valid: true,

            playerId,

            battleId,

            battle,

            state

        };

    }


    /* ========================================================
       validatePlayerInBattle
       ======================================================== */

    function validatePlayerInBattle(
        playerId,
        battleId
    ) {

        return getActionContext(
            playerId,
            battleId
        );

    }


    /* ========================================================
       playCard
       ======================================================== */

    /*
     * Plays a card from the player's hand.
     */

    async function playCard(
        context,
        data
    ) {

        const {

            playerId,

            battleId,

            state

        } =
            context;


        /*
         * Turn validation happens server-side.
         */

        const turnCheck =
            validateTurn(
                state,
                playerId
            );


        if (
            !turnCheck.valid
        ) {

            return failure(
                "NOT_YOUR_TURN",
                turnCheck.error
            );

        }


        const cardId =
            data &&
            data.cardId;


        if (
            !cardId ||
            typeof cardId !== "string"
        ) {

            return failure(
                "CARD_NOT_FOUND",
                "A card ID is required."
            );

        }


        const playerState =
            getPlayerState(
                state,
                playerId
            );


        if (
            !playerState
        ) {

            return failure(
                "NOT_IN_GAME",
                "Player game state could not be found."
            );

        }


        /*
         * Find the card in the player's hand.
         */

        const hand =
            Array.isArray(
                playerState.hand
            )
                ? playerState.hand
                : [];


        const handIndex =
            hand.findIndex(
                card =>
                    getCardId(
                        card
                    ) === cardId
            );


        if (
            handIndex === -1
        ) {

            return failure(
                "CARD_NOT_IN_HAND",
                "That card is not in your hand."
            );

        }


        /*
         * Check board capacity.
         */

        const inPlay =
            Array.isArray(
                playerState.inPlay
            )
                ? playerState.inPlay
                : [];


        if (
            inPlay.length >=
            defaults.maxCardsInPlay
        ) {

            return failure(
                "ACTION_NOT_ALLOWED",
                "You cannot have any more cards in play."
            );

        }


        const card =
            hand[handIndex];


        /*
         * Let card-rules perform additional validation if the
         * module exists.
         */

        if (
            cardRules &&
            typeof cardRules.canPlayCard === "function"
        ) {

            const ruleResult =
                cardRules.canPlayCard(
                    state,
                    playerId,
                    card
                );


            if (
                ruleResult &&
                ruleResult.valid === false
            ) {

                return failure(
                    ruleResult.code ||
                    "ACTION_NOT_ALLOWED",

                    ruleResult.error ||
                    "This card cannot be played."
                );

            }

        }


        /*
         * Remove the card from the hand.
         */

        hand.splice(
            handIndex,
            1
        );


        /*
         * Put the card into play.
         *
         * A battle card gets a runtime object so that future
         * systems can track:
         *
         * - current HP
         * - owner
         * - status effects
         * - temporary modifiers
         * - card instance ID
         */

        const runtimeCard =
            createRuntimeCard(
                card,
                playerId
            );


        inPlay.push(
            runtimeCard
        );


        playerState.hand =
            hand;


        playerState.inPlay =
            inPlay;


        /*
         * Let the game-state module know that the state has
         * changed.
         */

        saveState(
            battleId,
            state
        );


        emitEvent(
            "card.played",
            {

                battleId,

                playerId,

                cardId,

                card:
                    sanitizeCardForEvent(
                        runtimeCard
                    )

            }
        );


        return success({

            action:
                "playCard",

            card:
                runtimeCard

        });

    }


    /* ========================================================
       useAbility
       ======================================================== */

    /*
     * This is the most important action in this module.
     *
     * Resource requirements belong to the individual ability.
     */

    async function useAbility(
        context,
        data
    ) {

        const {

            playerId,

            battleId,

            state

        } =
            context;


        /*
         * ----------------------------------------------------
         * TURN
         * ----------------------------------------------------
         */

        const turnCheck =
            validateTurn(
                state,
                playerId
            );


        if (
            !turnCheck.valid
        ) {

            return failure(
                "NOT_YOUR_TURN",
                turnCheck.error
            );

        }


        /*
         * ----------------------------------------------------
         * CARD
         * ----------------------------------------------------
         */

        const cardId =
            data &&
            data.cardId;


        const abilityId =
            data &&
            data.abilityId;


        if (
            !cardId
        ) {

            return failure(
                "CARD_NOT_FOUND",
                "A card ID is required."
            );

        }


        if (
            !abilityId
        ) {

            return failure(
                "ABILITY_NOT_FOUND",
                "An ability ID is required."
            );

        }


        const playerState =
            getPlayerState(
                state,
                playerId
            );


        if (
            !playerState
        ) {

            return failure(
                "NOT_IN_GAME",
                "Player game state could not be found."
            );

        }


        /*
         * ----------------------------------------------------
         * IN-PLAY CARD
         * ----------------------------------------------------
         */

        const inPlay =
            Array.isArray(
                playerState.inPlay
            )
                ? playerState.inPlay
                : [];


        const cardIndex =
            inPlay.findIndex(
                card =>
                    getCardId(
                        card
                    ) === cardId
            );


        if (
            cardIndex === -1
        ) {

            return failure(
                "CARD_NOT_IN_PLAY",
                "That card is not currently in play."
            );

        }


        const card =
            inPlay[cardIndex];


        /*
         * ----------------------------------------------------
         * OWNERSHIP
         * ----------------------------------------------------
         */

        if (
            card.ownerId !== undefined &&
            card.ownerId !== playerId
        ) {

            return failure(
                "ACTION_NOT_ALLOWED",
                "You do not control this card."
            );

        }


        /*
         * ----------------------------------------------------
         * ABILITY
         * ----------------------------------------------------
         */

        const abilities =
            Array.isArray(
                card.abilities
            )
                ? card.abilities
                : [];


        const ability =
            abilities.find(
                candidate =>
                    candidate &&
                    candidate.id ===
                        abilityId
            );


        if (
            !ability
        ) {

            return failure(
                "ABILITY_NOT_FOUND",
                "That ability does not exist on this card."
            );

        }


        /*
         * ----------------------------------------------------
         * ADDITIONAL CARD-RULE VALIDATION
         * ----------------------------------------------------
         */

        if (
            cardRules &&
            typeof cardRules.canUseAbility ===
                "function"
        ) {

            const ruleResult =
                cardRules.canUseAbility(
                    state,
                    playerId,
                    card,
                    ability
                );


            if (
                ruleResult &&
                ruleResult.valid === false
            ) {

                return failure(
                    ruleResult.code ||
                    "ACTION_NOT_ALLOWED",

                    ruleResult.error ||
                    "This ability cannot currently be used."
                );

            }

        }


        /*
         * ----------------------------------------------------
         * RESOURCE REQUIREMENTS
         * ----------------------------------------------------
         *
         * This deliberately supports arbitrary resource names.
         *
         * It does NOT hardcode:
         *
         *     magik
         *     astralMagik
         *     gildedMagik
         *     bloodMagik
         *     darkMagik
         *
         * Future resources automatically work as long as the
         * player's state contains the resource.
         */

        const requiredResources =
            ability.requiredResources &&
            typeof ability.requiredResources ===
                "object"

                ? ability.requiredResources

                : {};


        const resources =
            playerState.resources &&
            typeof playerState.resources ===
                "object"

                ? playerState.resources

                : {};


        const resourceCheck =
            checkResources(
                resources,
                requiredResources
            );


        if (
            !resourceCheck.valid
        ) {

            return failure(
                "INSUFFICIENT_RESOURCES",
                resourceCheck.error,

                {

                    requiredResources,

                    availableResources:
                        resources

                }

            );

        }


        /*
         * ----------------------------------------------------
         * SPEND RESOURCES
         * ----------------------------------------------------
         *
         * Spending happens BEFORE the ability's effects.
         *
         * This prevents an ability from being executed for free.
         */

        spendResources(
            resources,
            requiredResources
        );


        playerState.resources =
            resources;


        /*
         * ----------------------------------------------------
         * EXECUTE EFFECTS
         * ----------------------------------------------------
         */

        const effectResult =
            executeEffects(
                state,
                playerId,
                card,
                ability
            );


        if (
            !effectResult.valid
        ) {

            /*
             * If an effect fails, refund the resources.
             *
             * This gives us transactional behavior.
             */

            refundResources(
                resources,
                requiredResources
            );


            playerState.resources =
                resources;


            return failure(
                effectResult.code ||
                "ACTION_NOT_ALLOWED",

                effectResult.error ||
                "The ability could not be executed."
            );

        }


        /*
         * ----------------------------------------------------
         * SAVE
         * ----------------------------------------------------
         */

        saveState(
            battleId,
            state
        );


        /*
         * ----------------------------------------------------
         * EVENT
         * ----------------------------------------------------
         */

        emitEvent(
            "ability.used",
            {

                battleId,

                playerId,

                cardId,

                abilityId,

                effects:
                    effectResult.effects

            }
        );


        return success({

            action:
                "useAbility",

            cardId,

            abilityId,

            spentResources:
                requiredResources,

            effects:
                effectResult.effects

        });

    }


    /* ========================================================
       endTurn
       ======================================================== */

    async function endTurn(
        context
    ) {

        const {

            playerId,

            battleId,

            state

        } =
            context;


        const turnCheck =
            validateTurn(
                state,
                playerId
            );


        if (
            !turnCheck.valid
        ) {

            return failure(
                "NOT_YOUR_TURN",
                turnCheck.error
            );

        }


        if (
            turnSystem &&
            typeof turnSystem.endTurn ===
                "function"
        ) {

            const result =
                await turnSystem.endTurn(
                    battleId,
                    playerId,
                    {
                        reason:
                            "manual"
                    }
                );


            if (
                result &&
                result.valid === false
            ) {

                return failure(
                    result.code ||
                    "ACTION_NOT_ALLOWED",

                    result.error ||
                    "Could not end turn."
                );

            }

        } else {

            /*
             * Fallback for the current early game-state module.
             */

            advanceTurnFallback(
                state,
                playerId
            );


            saveState(
                battleId,
                state
            );

        }


        emitEvent(
            "turn.ended",
            {

                battleId,

                playerId,

                reason:
                    "manual"

            }
        );


        return success({

            action:
                "endTurn"

        });

    }


    /* ========================================================
       drawCard
       ======================================================== */

    async function drawCard(
        context
    ) {

        const {

            playerId,

            battleId,

            state

        } =
            context;


        const playerState =
            getPlayerState(
                state,
                playerId
            );


        if (
            !playerState
        ) {

            return failure(
                "NOT_IN_GAME",
                "Player game state could not be found."
            );

        }


        const deck =
            Array.isArray(
                playerState.deck
            )
                ? playerState.deck
                : [];


        const hand =
            Array.isArray(
                playerState.hand
            )
                ? playerState.hand
                : [];


        if (
            deck.length === 0
        ) {

            return failure(
                "ACTION_NOT_ALLOWED",
                "There are no cards left to draw."
            );

        }


        if (
            hand.length >=
            defaults.maxHandSize
        ) {

            return failure(
                "ACTION_NOT_ALLOWED",
                "Your hand is full."
            );

        }


        const card =
            deck.shift();


        hand.push(
            card
        );


        playerState.deck =
            deck;


        playerState.hand =
            hand;


        /*
         * ----------------------------------------------------
         * MAGIK
         * ----------------------------------------------------
         *
         * The game rule says:
         *
         *     magik is gained when a card is drawn.
         *
         * We use the extensible resource map instead of
         * hardcoding the whole resource system.
         */

        ensureResources(
            playerState
        );


        playerState.resources.magik =
            (
                playerState.resources.magik ||
                0
            ) + 1;


        saveState(
            battleId,
            state
        );


        emitEvent(
            "card.drawn",
            {

                battleId,

                playerId,

                cardId:
                    getCardId(
                        card
                    )

            }
        );


        return success({

            action:
                "drawCard",

            card

        });

    }


    /* ========================================================
       discardCard
       ======================================================== */

    async function discardCard(
        context,
        data
    ) {

        const {

            playerId,

            battleId,

            state

        } =
            context;


        const playerState =
            getPlayerState(
                state,
                playerId
            );


        if (
            !playerState
        ) {

            return failure(
                "NOT_IN_GAME",
                "Player game state could not be found."
            );

        }


        const cardId =
            data &&
            data.cardId;


        if (
            !cardId
        ) {

            return failure(
                "CARD_NOT_FOUND",
                "A card ID is required."
            );

        }


        const hand =
            Array.isArray(
                playerState.hand
            )
                ? playerState.hand
                : [];


        const index =
            hand.findIndex(
                card =>
                    getCardId(
                        card
                    ) === cardId
            );


        if (
            index === -1
        ) {

            return failure(
                "CARD_NOT_IN_HAND",
                "That card is not in your hand."
            );

        }


        const [
            card
        ] =
            hand.splice(
                index,
                1
            );


        if (
            !Array.isArray(
                playerState.discard
            )
        ) {

            playerState.discard =
                [];

        }


        playerState.discard.push(
            card
        );


        ensureResources(
            playerState
        );


        /*
         * Dark Magik:
         *
         *     gained when a card is discarded.
         */

        playerState.resources.darkMagik =
            (
                playerState.resources.darkMagik ||
                0
            ) + 1;


        saveState(
            battleId,
            state
        );


        emitEvent(
            "card.discarded",
            {

                battleId,

                playerId,

                cardId

            }
        );


        return success({

            action:
                "discardCard",

            cardId

        });

    }


    /* ========================================================
       pass
       ======================================================== */

    async function pass(
        context
    ) {

        /*
         * Passing currently behaves like ending the player's
         * turn.
         *
         * It is kept as a separate action so the game can give
         * it different meaning later.
         */

        return endTurn(
            context
        );

    }


    /* ========================================================
       recordActivity
       ======================================================== */

    async function recordActivity(
        context
    ) {

        const {

            playerId,

            battleId

        } =
            context;


        /*
         * The player-presence module can listen for this event.
         *
         * The actual AFK timer remains server-side.
         */

        emitEvent(
            "player.activity",
            {

                battleId,

                playerId,

                timestamp:
                    Date.now()

            }
        );


        return success({

            action:
                "activity"

        });

    }


    /* ========================================================
       validateTurn
       ======================================================== */

    function validateTurn(
        state,
        playerId
    ) {

        if (
            !state
        ) {

            return {

                valid: false,

                error:
                    "Game state is unavailable."

            };

        }


        /*
         * Support either:
         *
         * state.currentTurn
         *
         * or
         *
         * state.turn.playerId
         */

        const currentPlayer =
            state.currentTurn ||
            (
                state.turn &&
                state.turn.playerId
            );


        if (
            currentPlayer === undefined ||
            currentPlayer === null
        ) {

            /*
             * During the early development stage there may
             * not be a turn assigned yet.
             *
             * Treating it as valid lets the game bootstrap.
             */

            return {

                valid: true

            };

        }


        if (
            String(
                currentPlayer
            ) !==
            String(
                playerId
            )
        ) {

            return {

                valid: false,

                error:
                    "It is not your turn."

            };

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       checkResources
       ======================================================== */

    function checkResources(
        available,
        required
    ) {

        for (
            const [
                resource,
                amount
            ]
            of Object.entries(
                required || {}
            )
        ) {

            const requiredAmount =
                Number(
                    amount
                );


            if (
                !Number.isFinite(
                    requiredAmount
                ) ||
                requiredAmount < 0
            ) {

                return {

                    valid: false,

                    error:
                        `Invalid resource requirement: ${resource}`

                };

            }


            const availableAmount =
                Number(
                    available[resource] ||
                    0
                );


            if (
                availableAmount <
                requiredAmount
            ) {

                return {

                    valid: false,

                    error:
                        `Not enough ${resource}.`

                };

            }

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       spendResources
       ======================================================== */

    function spendResources(
        available,
        required
    ) {

        for (
            const [
                resource,
                amount
            ]
            of Object.entries(
                required || {}
            )
        ) {

            available[resource] =
                Number(
                    available[resource] ||
                    0
                ) -
                Number(
                    amount
                );

        }

    }


    /* ========================================================
       refundResources
       ======================================================== */

    function refundResources(
        available,
        required
    ) {

        for (
            const [
                resource,
                amount
            ]
            of Object.entries(
                required || {}
            )
        ) {

            available[resource] =
                Number(
                    available[resource] ||
                    0
                ) +
                Number(
                    amount
                );

        }

    }


    /* ========================================================
       executeEffects
       ======================================================== */

    function executeEffects(
        state,
        playerId,
        card,
        ability
    ) {

        const effects =
            Array.isArray(
                ability.effects
            )
                ? ability.effects
                : [];


        const executed = [];


        for (
            const effect
            of effects
        ) {

            if (
                !effect ||
                typeof effect !== "object"
            ) {

                continue;

            }


            const type =
                String(
                    effect.type ||
                    ""
                );


            switch (type) {

                case "description":

                    /*
                     * Description-only effects are preserved
                     * for the UI but don't change state yet.
                     */

                    executed.push({

                        type:
                            "description",

                        text:
                            String(
                                effect.text ||
                                ""
                            )

                    });

                    break;


                case "damage":

                    executed.push(
                        executeDamageEffect(
                            state,
                            playerId,
                            effect
                        )
                    );

                    break;


                case "heal":

                    executed.push(
                        executeHealEffect(
                            state,
                            playerId,
                            effect
                        )
                    );

                    break;


                case "gainResource":

                    executed.push(
                        executeGainResourceEffect(
                            state,
                            playerId,
                            effect
                        )
                    );

                    break;


                default:

                    /*
                     * Unknown effects are not silently executed.
                     *
                     * This prevents a malformed card from
                     * performing an unintended operation.
                     */

                    return {

                        valid: false,

                        code:
                            "ACTION_NOT_ALLOWED",

                        error:
                            `Unsupported effect type: ${type}`

                    };

            }

        }


        return {

            valid: true,

            effects:
                executed

        };

    }


    /* ========================================================
       executeDamageEffect
       ======================================================== */

    function executeDamageEffect(
        state,
        playerId,
        effect
    ) {

        const amount =
            Number(
                effect.amount
            );


        /*
         * Target resolution will be expanded in card-rules.js.
         *
         * For now we return the validated effect rather than
         * guessing which opponent/card should be damaged.
         */

        return {

            type:
                "damage",

            amount:
                Number.isFinite(
                    amount
                )
                    ? amount
                    : 0,

            sourcePlayerId:
                playerId

        };

    }


    /* ========================================================
       executeHealEffect
       ======================================================== */

    function executeHealEffect(
        state,
        playerId,
        effect
    ) {

        const amount =
            Number(
                effect.amount
            );


        return {

            type:
                "heal",

            amount:
                Number.isFinite(
                    amount
                )
                    ? amount
                    : 0,

            targetPlayerId:
                playerId

        };

    }


    /* ========================================================
       executeGainResourceEffect
       ======================================================== */

    function executeGainResourceEffect(
        state,
        playerId,
        effect
    ) {

        const playerState =
            getPlayerState(
                state,
                playerId
            );


        ensureResources(
            playerState
        );


        const resource =
            String(
                effect.resource ||
                ""
            );


        const amount =
            Number(
                effect.amount
            );


        if (
            !resource ||
            !Number.isFinite(
                amount
            )
        ) {

            return {

                type:
                    "gainResource",

                resource,

                amount: 0

            };

        }


        playerState.resources[
            resource
        ] =
            (
                playerState.resources[
                    resource
                ] ||
                0
            ) +
            amount;


        return {

            type:
                "gainResource",

            resource,

            amount

        };

    }


    /* ========================================================
       ensureResources
       ======================================================== */

    function ensureResources(
        playerState
    ) {

        if (
            !playerState
        ) {

            return;

        }


        if (
            !playerState.resources ||
            typeof playerState.resources !==
                "object" ||
            Array.isArray(
                playerState.resources
            )
        ) {

            playerState.resources =
                {};

        }

    }


    /* ========================================================
       createRuntimeCard
       ======================================================== */

    function createRuntimeCard(
        card,
        ownerId
    ) {

        /*
         * Make a shallow copy so the original card definition
         * is not modified.
         */

        const runtimeCard = {

            ...card,

            ownerId,

            instanceId:
                createInstanceId(),

            currentHp:
                card.hp === null ||
                card.hp === undefined
                    ? null
                    : Number(
                        card.hp
                    ),

            abilities:
                Array.isArray(
                    card.abilities
                )
                    ? card.abilities.map(
                        ability => ({
                            ...ability,

                            requiredResources:
                                ability &&
                                ability.requiredResources
                                    ? {
                                        ...ability.requiredResources
                                    }
                                    : {},

                            effects:
                                Array.isArray(
                                    ability &&
                                    ability.effects
                                )
                                    ? ability.effects.map(
                                        effect => ({
                                            ...effect
                                        })
                                    )
                                    : []

                        })
                    )
                    : []

        };


        return runtimeCard;

    }


    /* ========================================================
       sanitizeCardForEvent
       ======================================================== */

    function sanitizeCardForEvent(
        card
    ) {

        if (
            !card ||
            typeof card !== "object"
        ) {

            return null;

        }


        return {

            id:
                card.id,

            instanceId:
                card.instanceId,

            name:
                card.name,

            hp:
                card.currentHp ??
                card.hp,

            power:
                card.power,

            rarity:
                card.rarity,

            abilities:
                Array.isArray(
                    card.abilities
                )
                    ? card.abilities.map(
                        ability => ({

                            id:
                                ability.id,

                            name:
                                ability.name,

                            requiredResources:
                                ability.requiredResources ||
                                {},

                            effects:
                                ability.effects ||
                                []

                        })
                    )
                    : []

        };

    }


    /* ========================================================
       getPlayerState
       ======================================================== */

    function getPlayerState(
        state,
        playerId
    ) {

        if (
            !state
        ) {

            return null;

        }


        /*
         * Current game-state designs may use:
         *
         * state.players[playerId]
         *
         * or
         *
         * state.playerStates[playerId]
         */

        if (
            state.players &&
            typeof state.players === "object"
        ) {

            if (
                state.players[playerId]
            ) {

                return state.players[playerId];

            }

        }


        if (
            state.playerStates &&
            typeof state.playerStates === "object"
        ) {

            if (
                state.playerStates[playerId]
            ) {

                return state.playerStates[playerId];

            }

        }


        return null;

    }


    /* ========================================================
       saveState
       ======================================================== */

    function saveState(
        battleId,
        state
    ) {

        if (
            gameState &&
            typeof gameState.setState ===
                "function"
        ) {

            gameState.setState(
                battleId,
                state
            );

        }

    }


    /* ========================================================
       emitEvent
       ======================================================== */

    function emitEvent(
        event,
        data
    ) {

        if (
            !eventBus
        ) {

            return;

        }


        if (
            typeof eventBus.emit ===
                "function"
        ) {

            eventBus.emit(
                event,
                data
            );

        }

    }


    /* ========================================================
       isPlayerInBattle
       ======================================================== */

    function isPlayerInBattle(
        battle,
        playerId
    ) {

        if (
            Array.isArray(
                battle.players
            )
        ) {

            return battle.players.some(
                player =>
                    String(
                        getPlayerId(
                            player
                        )
                    ) ===
                    String(
                        playerId
                    )
            );

        }


        if (
            battle.players &&
            typeof battle.players ===
                "object"
        ) {

            return Boolean(
                battle.players[
                    playerId
                ]
            );

        }


        if (
            Array.isArray(
                battle.playerIds
            )
        ) {

            return battle.playerIds.some(
                id =>
                    String(id) ===
                    String(playerId)
            );

        }


        return false;

    }


    /* ========================================================
       getPlayerId
       ======================================================== */

    function getPlayerId(
        player
    ) {

        if (
            player === null ||
            player === undefined
        ) {

            return null;

        }


        if (
            typeof player ===
                "object"
        ) {

            return (
                player.id ??
                player.playerId ??
                player.userId
            );

        }


        return player;

    }


    /* ========================================================
       getCardId
       ======================================================== */

    function getCardId(
        card
    ) {

        if (
            !card
        ) {

            return null;

        }


        if (
            typeof card ===
                "string"
        ) {

            return card;

        }


        return (
            card.id ??
            card.cardId
        );

    }


    /* ========================================================
       createInstanceId
       ======================================================== */

    function createInstanceId() {

        try {

            const crypto =
                require(
                    "crypto"
                );


            if (
                typeof crypto.randomUUID ===
                    "function"
            ) {

                return crypto.randomUUID();

            }

        } catch (error) {

            /*
             * Use fallback below.
             */

        }


        return (

            Date.now()
                .toString(36) +
            "-" +
            Math.random()
                .toString(36)
                .slice(2)

        );

    }


    /* ========================================================
       advanceTurnFallback
       ======================================================== */

    function advanceTurnFallback(
        state,
        currentPlayerId
    ) {

        let playerOrder =
            Array.isArray(
                state.playerOrder
            )
                ? state.playerOrder
                : null;


        if (
            !playerOrder &&
            Array.isArray(
                state.players
            )
        ) {

            playerOrder =
                state.players.map(
                    player =>
                        getPlayerId(
                            player
                        )
                );

        }


        if (
            !playerOrder &&
            state.players &&
            typeof state.players ===
                "object"
        ) {

            playerOrder =
                Object.keys(
                    state.players
                );

        }


        if (
            !playerOrder ||
            playerOrder.length === 0
        ) {

            return;

        }


        const currentIndex =
            playerOrder.findIndex(
                id =>
                    String(id) ===
                    String(
                        currentPlayerId
                    )
            );


        if (
            currentIndex === -1
        ) {

            return;

        }


        const nextIndex =
            (
                currentIndex + 1
            ) %
            playerOrder.length;


        state.currentTurn =
            playerOrder[
                nextIndex
            ];

    }


    /* ========================================================
       RESULT HELPERS
       ======================================================== */

    function success(
        data = {}
    ) {

        return {

            valid: true,

            ...data

        };

    }


    function failure(
        code,
        error,
        details = null
    ) {

        return {

            valid: false,

            code,

            error,

            details

        };

    }

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createGameActions

};
