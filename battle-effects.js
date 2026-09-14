/*
 * ============================================================
 * Card Stuff Yes
 * Battle Effects
 * ============================================================
 *
 * This module is responsible for resolving effects produced
 * by cards and abilities.
 *
 * Examples:
 *
 * - Damage
 * - Healing
 * - Draw cards
 * - Discard cards
 * - Gain resources
 * - Apply status effects
 * - Remove status effects
 * - Kill entities
 *
 * Effects are represented as data rather than being hardcoded
 * into individual cards.
 *
 * Example:
 *
 * {
 *     type: "damage",
 *     target: "enemy",
 *     amount: 25
 * }
 *
 * This makes it possible to add new effect types later.
 *
 * ============================================================
 */


"use strict";


/* ============================================================
   EFFECT TYPES
   ============================================================ */

const EFFECT_TYPES = Object.freeze({

    DAMAGE: "damage",

    HEAL: "heal",

    DRAW: "draw",

    DISCARD: "discard",

    GAIN_RESOURCE: "gainResource",

    SPEND_RESOURCE: "spendResource",

    ADD_STATUS: "addStatus",

    REMOVE_STATUS: "removeStatus",

    KILL: "kill",

    PLAY_CARD: "playCard",

    CUSTOM: "custom"

});


/* ============================================================
   EFFECT SYSTEM
   ============================================================ */

function createBattleEffects(options = {}) {

    /*
     * These dependencies are optional.
     *
     * The module can therefore be used while the rest of the
     * game engine is still being assembled.
     */

    const battleState =
        options.battleState || null;

    const cardRules =
        options.cardRules || null;

    const resourceSystem =
        options.resourceSystem || null;


    /*
     * Optional custom effect handlers.
     *
     * This is how future effect types can be added without
     * rewriting this module.
     *
     * Example:
     *
     * customEffects.set(
     *     "freeze",
     *     (effect, context) => {...}
     * );
     */

    const customEffects =
        options.customEffects instanceof Map
            ? options.customEffects
            : new Map();


    /* ========================================================
       HELPER: VALIDATE EFFECT
       ======================================================== */

    function validateEffect(effect) {

        if (!effect || typeof effect !== "object") {

            return {

                valid: false,

                reason:
                    "effect must be an object"

            };

        }


        if (
            typeof effect.type !==
            "string"
        ) {

            return {

                valid: false,

                reason:
                    "effect.type is required"

            };

        }


        return {
            valid: true
        };

    }


    /* ========================================================
       HELPER: GET PLAYER STATE
       ======================================================== */

    function getPlayerState(
        battleId,
        playerId
    ) {

        if (!battleState) {

            return null;

        }


        if (
            typeof battleState
                .getPlayerState ===
            "function"
        ) {

            return battleState.getPlayerState(
                battleId,
                playerId
            );

        }


        if (
            typeof battleState
                .getState ===
            "function"
        ) {

            const state =
                battleState.getState(
                    battleId
                );


            if (
                state &&
                state.players
            ) {

                return state.players[playerId];

            }

        }


        return null;

    }


    /* ========================================================
       HELPER: FIND TARGET
       ======================================================== */

    function resolveTarget(
        effect,
        context
    ) {

        /*
         * The effect can explicitly provide a target.
         */

        if (
            effect.targetPlayerId !==
            undefined
        ) {

            return {

                playerId:
                    effect.targetPlayerId

            };

        }


        if (
            effect.target ===
            "self"
        ) {

            return {

                playerId:
                    context.playerId

            };

        }


        if (
            effect.target ===
            "source"
        ) {

            return {

                playerId:
                    context.playerId

            };

        }


        /*
         * "opponent" is resolved using the battle state.
         */

        if (
            effect.target ===
            "opponent"
        ) {

            const state =
                battleState &&
                typeof battleState.getState ===
                "function"
                    ? battleState.getState(
                        context.battleId
                    )
                    : null;


            if (
                state &&
                Array.isArray(
                    state.players
                )
            ) {

                const opponent =
                    state.players.find(
                        player =>
                            String(
                                player.id
                            ) !==
                            String(
                                context.playerId
                            ) &&
                            !player.eliminated
                    );


                if (opponent) {

                    return {

                        playerId:
                            opponent.id

                    };

                }

            }


            /*
             * Some battle-state implementations store players
             * as an object instead of an array.
             */

            if (
                state &&
                state.players &&
                typeof state.players ===
                "object"
            ) {

                const opponentId =
                    Object.keys(
                        state.players
                    ).find(
                        id =>
                            String(id) !==
                            String(
                                context.playerId
                            ) &&
                            !state.players[id]
                                .eliminated
                    );


                if (opponentId) {

                    return {

                        playerId:
                            opponentId

                    };

                }

            }

        }


        return null;

    }


    /* ========================================================
       DAMAGE
       ======================================================== */

    function executeDamage(
        effect,
        context
    ) {

        const target =
            resolveTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                reason:
                    "damage target could not be resolved"

            };

        }


        const amount =
            Math.max(
                0,
                Number(
                    effect.amount
                ) || 0
            );


        /*
         * Prefer the battle-state API when available.
         */

        if (
            battleState &&
            typeof battleState.getPlayerState ===
            "function"
        ) {

            const player =
                battleState.getPlayerState(
                    context.battleId,
                    target.playerId
                );


            if (player) {

                const previousHP =
                    Number(
                        player.hp
                    ) || 0;


                player.hp =
                    Math.max(
                        0,
                        previousHP -
                        amount
                    );


                const damageResult = {

                    success: true,

                    type:
                        EFFECT_TYPES.DAMAGE,

                    playerId:
                        target.playerId,

                    amount,

                    previousHP,

                    hp:
                        player.hp,

                    killed:
                        player.hp <= 0

                };


                /*
                 * If the damage killed the entity, resolve the
                 * kill separately.
                 */

                if (
                    damageResult.killed
                ) {

                    executeKill(
                        {
                            type:
                                EFFECT_TYPES.KILL,

                            targetPlayerId:
                                target.playerId
                        },
                        context
                    );

                }


                return damageResult;

            }

        }


        /*
         * If no mutable battle state is available, return the
         * effect as a validated result instead of pretending
         * that state changed.
         */

        return {

            success: true,

            type:
                EFFECT_TYPES.DAMAGE,

            playerId:
                target.playerId,

            amount,

            appliedToState:
                false

        };

    }


    /* ========================================================
       HEAL
       ======================================================== */

    function executeHeal(
        effect,
        context
    ) {

        const target =
            resolveTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                reason:
                    "heal target could not be resolved"

            };

        }


        const amount =
            Math.max(
                0,
                Number(
                    effect.amount
                ) || 0
            );


        if (
            battleState &&
            typeof battleState.getPlayerState ===
            "function"
        ) {

            const player =
                battleState.getPlayerState(
                    context.battleId,
                    target.playerId
                );


            if (player) {

                const previousHP =
                    Number(
                        player.hp
                    ) || 0;


                const maxHP =
                    Number(
                        player.maxHP
                    ) ||
                    Number(
                        player.hp
                    ) ||
                    0;


                player.hp =
                    Math.min(
                        maxHP,
                        previousHP +
                        amount
                    );


                return {

                    success: true,

                    type:
                        EFFECT_TYPES.HEAL,

                    playerId:
                        target.playerId,

                    amount:

                        player.hp -
                        previousHP,

                    previousHP,

                    hp:
                        player.hp

                };

            }

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.HEAL,

            playerId:
                target.playerId,

            amount,

            appliedToState:
                false

        };

    }


    /* ========================================================
       DRAW CARDS
       ======================================================== */

    function executeDraw(
        effect,
        context
    ) {

        const playerId =
            effect.target === "self"
                ? context.playerId
                : (
                    effect.targetPlayerId ??
                    context.playerId
                );


        const amount =
            Math.max(
                1,
                Number(
                    effect.amount
                ) || 1
            );


        const drawnCards = [];


        if (
            battleState &&
            typeof battleState.drawCard ===
            "function"
        ) {

            for (
                let index = 0;
                index < amount;
                index++
            ) {

                const card =
                    battleState.drawCard(
                        context.battleId,
                        playerId
                    );


                if (!card) {

                    break;

                }


                drawnCards.push(
                    card
                );

            }

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.DRAW,

            playerId,

            requested:
                amount,

            drawn:
                drawnCards.length,

            cards:
                drawnCards

        };

    }


    /* ========================================================
       DISCARD
       ======================================================== */

    function executeDiscard(
        effect,
        context
    ) {

        const playerId =
            effect.targetPlayerId ??
            context.playerId;


        const amount =
            Math.max(
                1,
                Number(
                    effect.amount
                ) || 1
            );


        const discarded = [];


        if (
            battleState &&
            typeof battleState.discardCard ===
            "function"
        ) {

            for (
                let index = 0;
                index < amount;
                index++
            ) {

                const card =
                    battleState.discardCard(
                        context.battleId,
                        playerId,
                        effect.cardId
                    );


                if (!card) {

                    break;

                }


                discarded.push(
                    card
                );

            }

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.DISCARD,

            playerId,

            requested:
                amount,

            discarded:
                discarded.length,

            cards:
                discarded

        };

    }


    /* ========================================================
       GAIN RESOURCE
       ======================================================== */

    function executeGainResource(
        effect,
        context
    ) {

        const playerId =
            effect.targetPlayerId ??
            context.playerId;


        const resource =
            String(
                effect.resource ||
                ""
            ).trim();


        const amount =
            Math.max(
                0,
                Number(
                    effect.amount
                ) || 0
            );


        if (!resource) {

            return {

                success: false,

                reason:
                    "resource is required"

            };

        }


        if (
            resourceSystem &&
            typeof resourceSystem.gain ===
            "function"
        ) {

            const result =
                resourceSystem.gain(
                    context.battleId,
                    playerId,
                    resource,
                    amount
                );


            return {

                success: true,

                type:
                    EFFECT_TYPES.GAIN_RESOURCE,

                playerId,

                resource,

                amount,

                resourceResult:
                    result

            };

        }


        if (
            battleState &&
            typeof battleState.addResource ===
            "function"
        ) {

            const result =
                battleState.addResource(
                    context.battleId,
                    playerId,
                    resource,
                    amount
                );


            return {

                success: true,

                type:
                    EFFECT_TYPES.GAIN_RESOURCE,

                playerId,

                resource,

                amount,

                resourceResult:
                    result

            };

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.GAIN_RESOURCE,

            playerId,

            resource,

            amount,

            appliedToState:
                false

        };

    }


    /* ========================================================
       SPEND RESOURCE
       ======================================================== */

    function executeSpendResource(
        effect,
        context
    ) {

        const playerId =
            effect.targetPlayerId ??
            context.playerId;


        const resource =
            String(
                effect.resource ||
                ""
            ).trim();


        const amount =
            Math.max(
                0,
                Number(
                    effect.amount
                ) || 0
            );


        if (!resource) {

            return {

                success: false,

                reason:
                    "resource is required"

            };

        }


        if (
            resourceSystem &&
            typeof resourceSystem.spend ===
            "function"
        ) {

            const result =
                resourceSystem.spend(
                    context.battleId,
                    playerId,
                    resource,
                    amount
                );


            return {

                success:
                    result !== false,

                type:
                    EFFECT_TYPES.SPEND_RESOURCE,

                playerId,

                resource,

                amount,

                resourceResult:
                    result

            };

        }


        if (
            battleState &&
            typeof battleState.spendResource ===
            "function"
        ) {

            const result =
                battleState.spendResource(
                    context.battleId,
                    playerId,
                    resource,
                    amount
                );


            return {

                success:
                    result !== false,

                type:
                    EFFECT_TYPES.SPEND_RESOURCE,

                playerId,

                resource,

                amount,

                resourceResult:
                    result

            };

        }


        return {

            success: false,

            type:
                EFFECT_TYPES.SPEND_RESOURCE,

            reason:
                "no resource system is available"

        };

    }


    /* ========================================================
       ADD STATUS EFFECT
       ======================================================== */

    function executeAddStatus(
        effect,
        context
    ) {

        const playerId =
            effect.targetPlayerId ??
            context.playerId;


        const status =
            effect.status ||
            effect.statusEffect;


        if (!status) {

            return {

                success: false,

                reason:
                    "status is required"

            };

        }


        if (
            battleState &&
            typeof battleState.addStatusEffect ===
            "function"
        ) {

            const result =
                battleState.addStatusEffect(
                    context.battleId,
                    playerId,
                    status
                );


            return {

                success: true,

                type:
                    EFFECT_TYPES.ADD_STATUS,

                playerId,

                status,

                result

            };

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.ADD_STATUS,

            playerId,

            status,

            appliedToState:
                false

        };

    }


    /* ========================================================
       REMOVE STATUS EFFECT
       ======================================================== */

    function executeRemoveStatus(
        effect,
        context
    ) {

        const playerId =
            effect.targetPlayerId ??
            context.playerId;


        const status =
            effect.status ||
            effect.statusEffect;


        if (!status) {

            return {

                success: false,

                reason:
                    "status is required"

            };

        }


        if (
            battleState &&
            typeof battleState.removeStatusEffect ===
            "function"
        ) {

            const result =
                battleState.removeStatusEffect(
                    context.battleId,
                    playerId,
                    status
                );


            return {

                success: true,

                type:
                    EFFECT_TYPES.REMOVE_STATUS,

                playerId,

                status,

                result

            };

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.REMOVE_STATUS,

            playerId,

            status,

            appliedToState:
                false

        };

    }


    /* ========================================================
       KILL
       ======================================================== */

    function executeKill(
        effect,
        context
    ) {

        const target =
            resolveTarget(
                effect,
                context
            );


        if (!target) {

            return {

                success: false,

                reason:
                    "kill target could not be resolved"

            };

        }


        /*
         * Mark the target as eliminated when the battle state
         * provides that functionality.
         */

        if (
            battleState &&
            typeof battleState.eliminatePlayer ===
            "function"
        ) {

            const result =
                battleState.eliminatePlayer(
                    context.battleId,
                    target.playerId
                );


            return {

                success: true,

                type:
                    EFFECT_TYPES.KILL,

                playerId:
                    target.playerId,

                result

            };

        }


        return {

            success: true,

            type:
                EFFECT_TYPES.KILL,

            playerId:
                target.playerId,

            appliedToState:
                false

        };

    }


    /* ========================================================
       EXECUTE ONE EFFECT
       ======================================================== */

    function executeEffect(
        effect,
        context = {}
    ) {

        const validation =
            validateEffect(
                effect
            );


        if (!validation.valid) {

            return {

                success: false,

                reason:
                    validation.reason

            };

        }


        switch (effect.type) {

            case EFFECT_TYPES.DAMAGE:

                return executeDamage(
                    effect,
                    context
                );


            case EFFECT_TYPES.HEAL:

                return executeHeal(
                    effect,
                    context
                );


            case EFFECT_TYPES.DRAW:

                return executeDraw(
                    effect,
                    context
                );


            case EFFECT_TYPES.DISCARD:

                return executeDiscard(
                    effect,
                    context
                );


            case EFFECT_TYPES.GAIN_RESOURCE:

                return executeGainResource(
                    effect,
                    context
                );


            case EFFECT_TYPES.SPEND_RESOURCE:

                return executeSpendResource(
                    effect,
                    context
                );


            case EFFECT_TYPES.ADD_STATUS:

                return executeAddStatus(
                    effect,
                    context
                );


            case EFFECT_TYPES.REMOVE_STATUS:

                return executeRemoveStatus(
                    effect,
                    context
                );


            case EFFECT_TYPES.KILL:

                return executeKill(
                    effect,
                    context
                );


            case EFFECT_TYPES.CUSTOM: {

                const handler =
                    customEffects.get(
                        effect.name
                    );


                if (
                    typeof handler !==
                    "function"
                ) {

                    return {

                        success: false,

                        reason:
                            `No custom effect handler for "${effect.name}"`

                    };

                }


                return handler(
                    effect,
                    context
                );

            }


            default:

                return {

                    success: false,

                    reason:
                        `Unknown effect type "${effect.type}"`

                };

        }

    }


    /* ========================================================
       EXECUTE MULTIPLE EFFECTS
       ======================================================== */

    function executeEffects(
        effects,
        context = {}
    ) {

        if (!Array.isArray(effects)) {

            return {

                success: false,

                reason:
                    "effects must be an array",

                results: []

            };

        }


        const results = [];

        let success = true;


        for (
            const effect
            of effects
        ) {

            const result =
                executeEffect(
                    effect,
                    context
                );


            results.push(
                result
            );


            if (
                result.success === false
            ) {

                success = false;

            }

        }


        return {

            success,

            results

        };

    }


    /* ========================================================
       REGISTER CUSTOM EFFECT
       ======================================================== */

    function registerCustomEffect(
        name,
        handler
    ) {

        if (
            typeof name !==
            "string" ||
            !name.trim()
        ) {

            throw new Error(
                "Custom effect name is required"
            );

        }


        if (
            typeof handler !==
            "function"
        ) {

            throw new Error(
                "Custom effect handler must be a function"
            );

        }


        customEffects.set(
            name,
            handler
        );

    }


    /* ========================================================
       REMOVE CUSTOM EFFECT
       ======================================================== */

    function removeCustomEffect(
        name
    ) {

        return customEffects.delete(
            name
        );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        EFFECT_TYPES,

        executeEffect,

        executeEffects,

        registerCustomEffect,

        removeCustomEffect

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createBattleEffects,

    EFFECT_TYPES

};
