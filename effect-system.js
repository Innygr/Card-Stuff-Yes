/*
 * ============================================================
 * Card Stuff Yes
 * Effect System
 * ============================================================
 *
 * This module executes effects produced by card abilities.
 *
 * An ability can contain multiple effects.
 *
 * Example:
 *
 *     Ability
 *        |
 *        +-- Damage 25
 *        |
 *        +-- Apply Bleed
 *        |
 *        +-- Gain Blood Magik
 *
 * Effects are processed in order.
 *
 * ============================================================
 *
 * The effect system is deliberately extensible.
 *
 * Standard effects included here:
 *
 * - damage
 * - heal
 * - resource-gain
 * - resource-loss
 * - resource-transfer
 * - bleed
 * - draw
 * - discard
 * - destroy
 * - remove-status
 * - add-status
 *
 * Future effects can be registered without rewriting the
 * entire system.
 *
 * ============================================================
 */


/* ============================================================
   EFFECT SYSTEM FACTORY
   ============================================================ */

function createEffectSystem(options = {}) {

    /*
     * Resource system is injected instead of recreated here.
     */
    const resources =
        options.resources || null;


    /*
     * Card rules can provide low-level HP/card operations.
     */
    const cardRules =
        options.cardRules || null;


    /*
     * Optional callback for custom game-state changes.
     */
    const getPlayerState =
        typeof options.getPlayerState ===
        "function"

            ? options.getPlayerState

            : () => null;


    /*
     * Optional event callback.
     */
    const emitEvent =
        typeof options.emitEvent ===
        "function"

            ? options.emitEvent

            : () => {};


    /*
     * Custom effect handlers.
     *
     * A future module can register:
     *
     *     teleport
     *     summon
     *     freeze
     *
     * without modifying this file.
     */
    const customEffects = new Map();


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function toNumber(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);


        if (
            !Number.isFinite(
                number
            )
        ) {

            return fallback;

        }


        return number;

    }


    function normalizeType(
        type
    ) {

        return String(
            type || ""
        )
            .trim()
            .toLowerCase();

    }


    /* ========================================================
       REGISTER CUSTOM EFFECT
       ======================================================== */

    function registerEffect(
        type,
        handler
    ) {

        if (
            !type ||
            typeof handler !==
            "function"
        ) {

            return false;

        }


        customEffects.set(

            normalizeType(
                type
            ),

            handler

        );


        return true;

    }


    function unregisterEffect(
        type
    ) {

        return customEffects.delete(

            normalizeType(
                type
            )

        );

    }


    /* ========================================================
       RESOURCE HELPERS
       ======================================================== */

    function getResourcesForPlayer(
        state,
        playerId
    ) {

        const playerKey =
            String(
                playerId
            );


        if (
            !state.resources
        ) {

            state.resources = {};

        }


        if (
            !state.resources[playerKey]
        ) {

            if (
                resources &&
                typeof resources.createPool ===
                "function"
            ) {

                state.resources[playerKey] =
                    resources.createPool();

            } else {

                state.resources[playerKey] =
                    {};

            }

        }


        return state.resources[playerKey];

    }


    /* ========================================================
       TARGET HELPERS
       ======================================================== */

    /*
     * Effects may target:
     *
     * - an explicitly supplied target
     * - the ability's target
     * - the source card
     * - a player
     *
     * The caller is responsible for resolving complex
     * targeting rules.
     */
    function getTarget(
        effect,
        context
    ) {

        if (
            context.target
        ) {

            return context.target;

        }


        if (
            effect.target &&
            context.targets &&
            context.targets[
                effect.target
            ]
        ) {

            return context.targets[
                effect.target
            ];

        }


        return null;

    }


    /* ========================================================
       DAMAGE EFFECT
       ======================================================== */

    function damage(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        const amount =
            Math.max(

                0,

                toNumber(
                    effect.amount
                )

            );


        let result = null;


        /*
         * Prefer card-rules damage handling.
         */
        if (
            cardRules &&
            typeof cardRules.damageCard ===
            "function"
        ) {

            result =
                cardRules.damageCard(

                    state,

                    target,

                    amount,

                    context.source || null

                );

        } else {

            /*
             * Basic fallback.
             */
            const previousHP =
                Math.max(

                    0,

                    toNumber(
                        target.hp
                    )

                );


            target.hp =
                Math.max(

                    0,

                    previousHP -
                    amount

                );


            result = {

                success: true,

                previousHP,

                damage:
                    amount,

                hp:
                    target.hp,

                killed:
                    target.hp <= 0

            };

        }


        if (
            result &&
            result.killed
        ) {

            /*
             * The owner of the target receives Blood Magik
             * according to the current game rule.
             */
            const targetOwner =
                target.ownerId ??
                target.playerId;


            if (
                targetOwner != null
            ) {

                const targetResources =
                    getResourcesForPlayer(

                        state,

                        targetOwner

                    );


                if (
                    resources &&
                    typeof resources.onEntityKilled ===
                    "function"
                ) {

                    resources.onEntityKilled(

                        targetResources

                    );

                }

            }

        }


        emitEvent({

            type:
                "effect.damage",

            battleId:
                context.battleId ||
                null,

            playerId:
                context.playerId ||
                null,

            target,

            amount,

            result

        });


        return result;

    }


    /* ========================================================
       HEAL EFFECT
       ======================================================== */

    function heal(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        const amount =
            Math.max(

                0,

                toNumber(
                    effect.amount
                )

            );


        let result = null;


        if (
            cardRules &&
            typeof cardRules.healCard ===
            "function"
        ) {

            result =
                cardRules.healCard(

                    target,

                    amount

                );

        } else {

            const previousHP =
                Math.max(

                    0,

                    toNumber(
                        target.hp
                    )

                );


            const maxHP =
                Math.max(

                    previousHP,

                    toNumber(
                        target.maxHP,
                        previousHP
                    )

                );


            target.hp =
                Math.min(

                    maxHP,

                    previousHP +
                    amount

                );


            result = {

                success: true,

                previousHP,

                healing:
                    target.hp -
                    previousHP,

                hp:
                    target.hp,

                maxHP

            };

        }


        emitEvent({

            type:
                "effect.heal",

            battleId:
                context.battleId ||
                null,

            playerId:
                context.playerId ||
                null,

            target,

            result

        });


        return result;

    }


    /* ========================================================
       RESOURCE GAIN
       ======================================================== */

    function resourceGain(
        state,
        effect,
        context
    ) {

        if (
            !resources
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_SYSTEM_NOT_AVAILABLE"

            };

        }


        const playerId =
            effect.playerId ??
            context.resourcePlayerId ??
            context.playerId;


        if (
            playerId == null
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_PLAYER_NOT_FOUND"

            };

        }


        const resourcePool =
            getResourcesForPlayer(

                state,

                playerId

            );


        const resourceName =
            effect.resource;


        const amount =
            Math.max(

                0,

                toNumber(
                    effect.amount
                )

            );


        const result =
            resources.add(

                resourcePool,

                resourceName,

                amount,

                {

                    reason:
                        "effect",

                    source:
                        context.source ||
                        null

                }

            );


        emitEvent({

            type:
                "effect.resource-gain",

            battleId:
                context.battleId ||
                null,

            playerId:
                String(
                    playerId
                ),

            resource:
                resourceName,

            amount,

            result

        });


        return result;

    }


    /* ========================================================
       RESOURCE LOSS
       ======================================================== */

    function resourceLoss(
        state,
        effect,
        context
    ) {

        if (
            !resources
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_SYSTEM_NOT_AVAILABLE"

            };

        }


        const playerId =
            effect.playerId ??
            context.resourcePlayerId ??
            context.playerId;


        if (
            playerId == null
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_PLAYER_NOT_FOUND"

            };

        }


        const resourcePool =
            getResourcesForPlayer(

                state,

                playerId

            );


        const resourceName =
            effect.resource;


        const amount =
            Math.max(

                0,

                toNumber(
                    effect.amount
                )

            );


        const result =
            resources.remove(

                resourcePool,

                resourceName,

                amount,

                {

                    reason:
                        "effect",

                    source:
                        context.source ||
                        null

                }

            );


        emitEvent({

            type:
                "effect.resource-loss",

            battleId:
                context.battleId ||
                null,

            playerId:
                String(
                    playerId
                ),

            resource:
                resourceName,

            amount,

            result

        });


        return result;

    }


    /* ========================================================
       RESOURCE TRANSFER
       ======================================================== */

    function resourceTransfer(
        state,
        effect,
        context
    ) {

        if (
            !resources
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_SYSTEM_NOT_AVAILABLE"

            };

        }


        const fromPlayerId =
            effect.fromPlayerId ??
            context.playerId;


        const toPlayerId =
            effect.toPlayerId ??
            context.targetPlayerId;


        if (
            fromPlayerId == null ||
            toPlayerId == null
        ) {

            return {

                success: false,

                error:
                    "RESOURCE_PLAYER_NOT_FOUND"

            };

        }


        const fromResources =
            getResourcesForPlayer(

                state,

                fromPlayerId

            );


        const toResources =
            getResourcesForPlayer(

                state,

                toPlayerId

            );


        const result =
            resources.transfer(

                fromResources,

                toResources,

                effect.resource,

                effect.amount,

                {

                    reason:
                        "effect",

                    source:
                        context.source ||
                        null

                }

            );


        emitEvent({

            type:
                "effect.resource-transfer",

            battleId:
                context.battleId ||
                null,

            fromPlayerId:
                String(
                    fromPlayerId
                ),

            toPlayerId:
                String(
                    toPlayerId
                ),

            resource:
                effect.resource,

            amount:
                effect.amount,

            result

        });


        return result;

    }


    /* ========================================================
       BLEED EFFECT
       ======================================================== */

    function applyBleed(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                target.statusEffects
            )
        ) {

            target.statusEffects =
                [];

        }


        const status = {

            id:
                effect.id ||
                `bleed-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,

            type:
                "bleed",

            amount:
                Math.max(

                    0,

                    toNumber(
                        effect.amount
                    )

                ),

            duration:
                Math.max(

                    0,

                    Math.floor(
                        toNumber(
                            effect.duration
                        )
                    )

                ),

            sourcePlayerId:
                context.playerId ??
                null,

            createdAt:
                Date.now()

        };


        target.statusEffects.push(
            status
        );


        emitEvent({

            type:
                "effect.bleed",

            battleId:
                context.battleId ||
                null,

            playerId:
                context.playerId ||
                null,

            target,

            status

        });


        return {

            success: true,

            status

        };

    }


    /* ========================================================
       ADD STATUS
       ======================================================== */

    function addStatus(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                target.statusEffects
            )
        ) {

            target.statusEffects =
                [];

        }


        const status = {

            id:
                effect.id ||
                `status-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,

            type:
                effect.status ||
                "unknown",

            duration:
                effect.duration == null
                    ? null
                    : Math.max(

                        0,

                        Math.floor(
                            toNumber(
                                effect.duration
                            )
                        )

                    ),

            amount:
                effect.amount == null
                    ? null
                    : toNumber(
                        effect.amount
                    ),

            data:
                effect.data &&
                typeof effect.data ===
                "object"

                    ? {
                        ...effect.data
                    }

                    : {},

            sourcePlayerId:
                context.playerId ??
                null,

            createdAt:
                Date.now()

        };


        target.statusEffects.push(
            status
        );


        return {

            success: true,

            status

        };

    }


    /* ========================================================
       REMOVE STATUS
       ======================================================== */

    function removeStatus(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                target.statusEffects
            )
        ) {

            return {

                success: true,

                removed: []

            };

        }


        const statusType =
            effect.status ||
            null;


        const statusId =
            effect.statusId ||
            null;


        const removed = [];


        target.statusEffects =
            target.statusEffects.filter(
                status => {

                    const matchesId =
                        statusId != null &&
                        String(
                            status.id
                        ) ===
                        String(
                            statusId
                        );


                    const matchesType =
                        statusType != null &&
                        String(
                            status.type
                        ) ===
                        String(
                            statusType
                        );


                    if (
                        matchesId ||
                        matchesType
                    ) {

                        removed.push(
                            status
                        );

                        return false;

                    }


                    return true;

                }
            );


        return {

            success: true,

            removed

        };

    }


    /* ========================================================
       DRAW EFFECT
       ======================================================== */

    function draw(
        state,
        effect,
        context
    ) {

        const playerId =
            effect.playerId ??
            context.playerId;


        if (
            playerId == null
        ) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        const playerKey =
            String(
                playerId
            );


        if (
            !state.deck
        ) {

            state.deck = {};

        }


        if (
            !state.hand
        ) {

            state.hand = {};

        }


        if (
            !Array.isArray(
                state.deck[playerKey]
            )
        ) {

            return {

                success: false,

                error:
                    "DECK_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                state.hand[playerKey]
            )
        ) {

            state.hand[playerKey] =
                [];

        }


        const count =
            Math.max(

                1,

                Math.floor(
                    toNumber(
                        effect.amount,
                        1
                    )
                )

            );


        const drawn = [];


        for (
            let index = 0;
            index < count;
            index++
        ) {

            if (
                state.deck[playerKey]
                    .length ===
                0
            ) {

                break;

            }


            const card =
                state.deck[playerKey]
                    .shift();


            state.hand[playerKey]
                .push(
                    card
                );


            drawn.push(
                card
            );


            /*
             * Drawing a card grants Magik.
             */
            if (
                resources
            ) {

                const pool =
                    getResourcesForPlayer(

                        state,

                        playerId

                    );


                resources.onCardDraw(
                    pool
                );

            }

        }


        return {

            success: true,

            drawn,

            count:
                drawn.length

        };

    }


    /* ========================================================
       DISCARD EFFECT
       ======================================================== */

    function discard(
        state,
        effect,
        context
    ) {

        const playerId =
            effect.playerId ??
            context.playerId;


        if (
            playerId == null
        ) {

            return {

                success: false,

                error:
                    "PLAYER_NOT_FOUND"

            };

        }


        const playerKey =
            String(
                playerId
            );


        if (
            !state.hand ||
            !Array.isArray(
                state.hand[playerKey]
            )
        ) {

            return {

                success: false,

                error:
                    "HAND_NOT_FOUND"

            };

        }


        if (
            !Array.isArray(
                state.discard
            )
        ) {

            state.discard = [];

        }


        const index =
            Number(
                effect.cardIndex
            );


        if (
            !Number.isInteger(
                index
            ) ||
            index < 0 ||
            index >=
                state.hand[playerKey].length
        ) {

            return {

                success: false,

                error:
                    "INVALID_CARD_INDEX"

            };

        }


        const card =
            state.hand[playerKey]
                .splice(
                    index,
                    1
                )[0];


        state.discard.push(
            card
        );


        /*
         * Discarding grants Dark Magik.
         */
        if (
            resources
        ) {

            const pool =
                getResourcesForPlayer(

                    state,

                    playerId

                );


            resources.onCardDiscarded(
                pool
            );

        }


        return {

            success: true,

            card

        };

    }


    /* ========================================================
       DESTROY EFFECT
       ======================================================== */

    function destroy(
        state,
        effect,
        context
    ) {

        const target =
            getTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        target.hp = 0;

        target.defeated = true;

        target.destroyed = true;


        /*
         * Blood Magik is granted when an entity is killed.
         */
        const ownerId =
            target.ownerId ??
            target.playerId;


        if (
            ownerId != null &&
            resources
        ) {

            const pool =
                getResourcesForPlayer(

                    state,

                    ownerId

                );


            resources.onEntityKilled(
                pool
            );

        }


        return {

            success: true,

            destroyed: true,

            target

        };

    }


    /* ========================================================
       EXECUTE ONE EFFECT
       ======================================================== */

    function executeEffect(
        state,
        effect,
        context = {}
    ) {

        if (
            !effect ||
            typeof effect !==
            "object"
        ) {

            return {

                success: false,

                error:
                    "INVALID_EFFECT"

            };

        }


        const type =
            normalizeType(
                effect.type
            );


        /*
         * Give custom handlers priority.
         */
        const customHandler =
            customEffects.get(
                type
            );


        if (
            customHandler
        ) {

            try {

                return customHandler(

                    state,

                    effect,

                    context

                );

            } catch (error) {

                return {

                    success: false,

                    error:
                        "CUSTOM_EFFECT_ERROR",

                    message:
                        error.message

                };

            }

        }


        /* ----------------------------------------------------
           STANDARD EFFECTS
           ---------------------------------------------------- */

        switch (type) {

            case "damage":

                return damage(
                    state,
                    effect,
                    context
                );


            case "heal":

                return heal(
                    state,
                    effect,
                    context
                );


            case "resource-gain":

                return resourceGain(
                    state,
                    effect,
                    context
                );


            case "resource-loss":

                return resourceLoss(
                    state,
                    effect,
                    context
                );


            case "resource-transfer":

                return resourceTransfer(
                    state,
                    effect,
                    context
                );


            case "bleed":

                return applyBleed(
                    state,
                    effect,
                    context
                );


            case "add-status":

                return addStatus(
                    state,
                    effect,
                    context
                );


            case "remove-status":

                return removeStatus(
                    state,
                    effect,
                    context
                );


            case "draw":

                return draw(
                    state,
                    effect,
                    context
                );


            case "discard":

                return discard(
                    state,
                    effect,
                    context
                );


            case "destroy":

                return destroy(
                    state,
                    effect,
                    context
                );


            default:

                return {

                    success: false,

                    error:
                        "UNKNOWN_EFFECT",

                    effectType:
                        type

                };

        }

    }


    /* ========================================================
       EXECUTE MULTIPLE EFFECTS
       ======================================================== */

    /*
     * Executes all effects belonging to one ability.
     *
     * Effects execute in array order.
     */
    function executeEffects(
        state,
        effects = [],
        context = {}
    ) {

        if (
            !Array.isArray(
                effects
            )
        ) {

            return {

                success: false,

                error:
                    "INVALID_EFFECT_LIST"

            };

        }


        const results = [];


        for (
            let index = 0;
            index < effects.length;
            index++
        ) {

            const effect =
                effects[index];


            const result =
                executeEffect(

                    state,

                    effect,

                    {

                        ...context,

                        effectIndex:
                            index

                    }

                );


            results.push(
                result
            );


            /*
             * An ability is considered failed if any effect
             * cannot be resolved.
             */
            if (
                !result.success
            ) {

                return {

                    success: false,

                    error:
                        "EFFECT_EXECUTION_FAILED",

                    failedEffectIndex:
                        index,

                    results

                };

            }

        }


        return {

            success: true,

            results

        };

    }


    /* ========================================================
       ABILITY EFFECT EXECUTION
       ======================================================== */

    /*
     * Executes the effects belonging to an ability.
     *
     * Resource costs are intentionally NOT handled here.
     *
     * The ability/action layer should spend the required
     * resources before calling this function.
     *
     * This keeps:
     *
     *     ability cost
     *
     * separate from:
     *
     *     ability effects
     *
     * ========================================================
     */
    function executeAbility(
        state,
        ability,
        context = {}
    ) {

        if (
            !ability ||
            typeof ability !==
            "object"
        ) {

            return {

                success: false,

                error:
                    "ABILITY_NOT_FOUND"

            };

        }


        const effects =
            Array.isArray(
                ability.effects
            )
                ? ability.effects
                : [];


        return executeEffects(

            state,

            effects,

            {

                ...context,

                abilityId:
                    ability.id ??
                    null

            }

        );

    }


    /* ========================================================
       PLAYER STATE HELPER
       ======================================================== */

    /*
     * Some future effects may need the player's complete
     * state rather than only resources.
     */
    function getPlayer(
        state,
        playerId
    ) {

        return getPlayerState(

            state,

            playerId

        );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        registerEffect,

        unregisterEffect,

        executeEffect,

        executeEffects,

        executeAbility,

        getPlayer,

        getResourcesForPlayer

    };

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createEffectSystem

};
