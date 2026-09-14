/*
 * ============================================================
 * Card Stuff Yes
 * Card Rules
 * ============================================================
 *
 * This module contains the actual rules governing cards.
 *
 * Responsibilities:
 *
 * - Deck size
 * - Duplicate limits
 * - Card limits
 * - Resources
 * - Ability requirements
 * - HP
 * - Damage
 * - Healing
 * - Playing cards
 * - Discarding cards
 * - Multiple abilities
 * - Ability effects
 *
 * ============================================================
 *
 * IMPORTANT:
 *
 * Resources are intentionally NOT hardcoded into the main
 * game logic.
 *
 * That means a future resource such as:
 *
 *     voidMagik
 *
 * can be added without rewriting the entire resource system.
 *
 * ============================================================
 */


/* ============================================================
   DEFAULT GAME RULES
   ============================================================ */

const DEFAULT_RULES = {

    /*
     * A normal deck contains exactly 60 cards.
     */
    deckSize: 60,

    /*
     * By default, a player may have up to four copies of the
     * same card.
     *
     * Individual cards can override this with cardLimit.
     */
    defaultCardLimit: 4,

    /*
     * Maximum cards a player can have in their hand.
     *
     * This is deliberately configurable because the final
     * game design may use a smaller value.
     */
    maxHandSize: 60,

    /*
     * Maximum number of cards that may simultaneously be in play.
     */
    maxCardsInPlay: 20,

    /*
     * Starting HP if a card does not specify HP.
     */
    defaultCardHP: 100,

    /*
     * Minimum HP.
     */
    minimumHP: 0,

    /*
     * Maximum supported HP.
     */
    maximumHP: 999999999

};


/* ============================================================
   DEFAULT RESOURCES
   ============================================================ */

/*
 * These are the resources currently defined by Card Stuff Yes.
 *
 * The object is only a default starting resource pool.
 *
 * The rules system itself supports arbitrary resource names.
 */
const DEFAULT_RESOURCES = {

    magik: 0,

    astralMagik: 0,

    gildedMagik: 0,

    bloodMagik: 0,

    darkMagik: 0

};


/* ============================================================
   CARD RULES FACTORY
   ============================================================ */

function createCardRules(options = {}) {

    /*
     * Allow server.js to override rules later.
     */
    const rules = {

        ...DEFAULT_RULES,

        ...(options.rules || {})

    };


    /*
     * Allow additional default resources to be supplied.
     *
     * Future resources can therefore be introduced without
     * changing this module.
     */
    const defaultResources = {

        ...DEFAULT_RESOURCES,

        ...(options.resources || {})

    };


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function clamp(
        value,
        minimum,
        maximum
    ) {

        return Math.min(

            maximum,

            Math.max(
                minimum,
                value
            )

        );

    }


    function normalizeCardId(
        cardId
    ) {

        return String(cardId);

    }


    function normalizeResourceName(
        resourceName
    ) {

        return String(
            resourceName
        );

    }


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


    /* ========================================================
       RESOURCE SYSTEM
       ======================================================== */

    /*
     * Creates a new resource pool.
     */
    function createResourcePool(
        initial = {}
    ) {

        const resources = {

            ...defaultResources

        };


        /*
         * Copy arbitrary additional resources.
         *
         * This is what makes the resource system extensible.
         */
        for (
            const [
                name,
                amount
            ]
            of Object.entries(initial)
        ) {

            resources[
                normalizeResourceName(name)
            ] =
                Math.max(
                    0,
                    toNumber(
                        amount
                    )
                );

        }


        return resources;

    }


    /*
     * Get a resource amount.
     *
     * Unknown resources are treated as zero.
     */
    function getResource(
        resources,
        resourceName
    ) {

        if (
            !resources
        ) {

            return 0;

        }


        return Math.max(

            0,

            toNumber(
                resources[
                    normalizeResourceName(
                        resourceName
                    )
                ],
                0
            )

        );

    }


    /*
     * Add a resource.
     *
     * Unknown resources are automatically created.
     */
    function addResource(
        resources,
        resourceName,
        amount
    ) {

        if (!resources) {

            return false;

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        const value =
            toNumber(
                amount
            );


        if (
            value === 0
        ) {

            if (
                resources[name] == null
            ) {

                resources[name] = 0;

            }

            return true;

        }


        resources[name] =
            Math.max(

                0,

                getResource(
                    resources,
                    name
                ) + value

            );


        return true;

    }


    /*
     * Remove a resource.
     */
    function removeResource(
        resources,
        resourceName,
        amount
    ) {

        const value =
            toNumber(
                amount
            );


        if (
            value < 0
        ) {

            return false;

        }


        const current =
            getResource(
                resources,
                resourceName
            );


        if (
            current < value
        ) {

            return false;

        }


        resources[
            normalizeResourceName(
                resourceName
            )
        ] =
            current - value;


        return true;

    }


    /*
     * Check whether a resource pool contains enough resources
     * for a requirement object.
     *
     * Example:
     *
     * {
     *     astralMagik: 2,
     *     bloodMagik: 1
     * }
     */
    function hasResources(
        resources,
        requiredResources = {}
    ) {

        for (
            const [
                resourceName,
                requiredAmount
            ]
            of Object.entries(
                requiredResources || {}
            )
        ) {

            const amount =
                Math.max(

                    0,

                    toNumber(
                        requiredAmount
                    )

                );


            if (
                getResource(
                    resources,
                    resourceName
                ) <
                amount
            ) {

                return false;

            }

        }


        return true;

    }


    /*
     * Spend a resource requirement.
     */
    function spendResources(
        resources,
        requiredResources = {}
    ) {

        if (
            !hasResources(
                resources,
                requiredResources
            )
        ) {

            return {

                success: false,

                error:
                    "INSUFFICIENT_RESOURCES"

            };

        }


        /*
         * Spend only after we know that every resource is
         * available.
         */
        for (
            const [
                resourceName,
                requiredAmount
            ]
            of Object.entries(
                requiredResources || {}
            )
        ) {

            removeResource(

                resources,

                resourceName,

                Math.max(

                    0,

                    toNumber(
                        requiredAmount
                    )

                )

            );

        }


        return {

            success: true

        };

    }


    /*
     * Refund resources.
     *
     * Useful if an effect fails after the cost was paid.
     */
    function refundResources(
        resources,
        requiredResources = {}
    ) {

        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requiredResources || {}
            )
        ) {

            addResource(

                resources,

                resourceName,

                Math.max(
                    0,
                    toNumber(
                        amount
                    )
                )

            );

        }


        return true;

    }


    /* ========================================================
       CARD LIMITS
       ======================================================== */

    /*
     * Gets the copy limit for a card.
     *
     * cardLimit can be:
     *
     *     1
     *     2
     *     4
     *     etc.
     *
     * If the card does not define one, the default is four.
     */
    function getCardLimit(
        card
    ) {

        if (
            card &&
            Number.isFinite(
                Number(
                    card.cardLimit
                )
            )
        ) {

            return Math.max(

                1,

                Math.floor(
                    Number(
                        card.cardLimit
                    )
                )

            );

        }


        return rules.defaultCardLimit;

    }


    /*
     * Count copies of cards in a collection.
     */
    function countCardCopies(
        cards = []
    ) {

        const counts = {};


        for (
            const card
            of cards
        ) {

            const cardId =
                typeof card === "string"
                    ? card
                    : card?.cardId ??
                      card?.id;


            if (
                cardId == null
            ) {

                continue;

            }


            const id =
                normalizeCardId(
                    cardId
                );


            counts[id] =
                (
                    counts[id] ||
                    0
                ) + 1;

        }


        return counts;

    }


    /* ========================================================
       DECK VALIDATION
       ======================================================== */

    /*
     * Validate a complete deck.
     *
     * The server should call this before saving a deck.
     *
     * A deck must contain exactly 60 cards.
     */
    function validateDeck(
        cards = [],
        cardLookup = null
    ) {

        if (
            !Array.isArray(cards)
        ) {

            return {

                valid: false,

                errors: [
                    "Deck must be an array."
                ]

            };

        }


        const errors = [];


        /*
         * Exact deck size.
         */
        if (
            cards.length !==
            rules.deckSize
        ) {

            errors.push(

                `Deck must contain exactly ${rules.deckSize} cards.`

            );

        }


        const counts =
            countCardCopies(
                cards
            );


        /*
         * Validate duplicate limits.
         */
        for (
            const [
                cardId,
                count
            ]
            of Object.entries(
                counts
            )
        ) {

            let card = null;


            if (
                cardLookup
            ) {

                if (
                    cardLookup instanceof Map
                ) {

                    card =
                        cardLookup.get(
                            cardId
                        );

                } else if (
                    typeof cardLookup ===
                    "object"
                ) {

                    card =
                        cardLookup[
                            cardId
                        ];

                }

            }


            const limit =
                getCardLimit(
                    card
                );


            if (
                count >
                limit
            ) {

                errors.push(

                    `Card ${cardId} exceeds its copy limit of ${limit}.`

                );

            }

        }


        return {

            valid:
                errors.length === 0,

            errors

        };

    }


    /* ========================================================
       CARD INSTANCE CREATION
       ======================================================== */

    /*
     * Create the runtime representation of a card.
     *
     * The original card definition should remain unchanged.
     *
     * Each card in a battle receives its own runtime instance.
     */
    function createCardInstance(
        card,
        ownerId = null
    ) {

        if (!card) {

            return null;

        }


        const cardId =
            card.id ??
            card.cardId;


        const instanceId =

            `${normalizeCardId(cardId)}-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}`;


        const maxHP =
            clamp(

                toNumber(
                    card.hp,
                    rules.defaultCardHP
                ),

                rules.minimumHP,

                rules.maximumHP

            );


        return {

            instanceId,

            cardId:
                normalizeCardId(
                    cardId
                ),

            ownerId:
                ownerId == null
                    ? null
                    : String(ownerId),

            name:
                card.name ||
                "Unnamed Card",

            hp:
                maxHP,

            maxHP,

            power:
                Math.max(

                    0,

                    toNumber(
                        card.power
                    )

                ),

            rarity:
                card.rarity ||
                "common",

            abilities:
                Array.isArray(
                    card.abilities
                )
                    ? card.abilities.map(
                        ability =>
                            normalizeAbility(
                                ability
                            )
                    )
                    : [],

            cardLimit:
                getCardLimit(
                    card
                ),

            isSpecialEventCard:
                Boolean(
                    card.isSpecialEventCard
                ),

            statusEffects: [],

            inPlay: false

        };

    }


    /* ========================================================
       ABILITY NORMALIZATION
       ======================================================== */

    /*
     * Ensures every ability has a predictable structure.
     *
     * Resource requirements belong to the individual ability,
     * NOT to the card.
     */
    function normalizeAbility(
        ability
    ) {

        if (!ability) {

            return {

                id:
                    "unknown",

                name:
                    "Unknown Ability",

                requiredResources: {},

                effects: []

            };

        }


        return {

            id:
                ability.id ??
                `ability-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,

            name:
                ability.name ||
                "Unnamed Ability",

            requiredResources:
                normalizeResourceRequirements(
                    ability.requiredResources
                ),

            effects:
                Array.isArray(
                    ability.effects
                )
                    ? ability.effects
                    : [],

            description:
                ability.description ||
                "",

            cooldown:
                Math.max(

                    0,

                    Math.floor(
                        toNumber(
                            ability.cooldown
                        )
                    )

                ),

            oncePerTurn:
                Boolean(
                    ability.oncePerTurn
                )

        };

    }


    function normalizeResourceRequirements(
        requiredResources
    ) {

        const result = {};


        if (
            !requiredResources ||
            typeof requiredResources !==
            "object"
        ) {

            return result;

        }


        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requiredResources
            )
        ) {

            const numericAmount =
                toNumber(
                    amount
                );


            if (
                numericAmount <= 0
            ) {

                continue;

            }


            result[
                normalizeResourceName(
                    resourceName
                )
            ] =
                numericAmount;

        }


        return result;

    }


    /* ========================================================
       ABILITY LOOKUP
       ======================================================== */

    function getAbility(
        cardInstance,
        abilityId
    ) {

        if (
            !cardInstance ||
            !Array.isArray(
                cardInstance.abilities
            )
        ) {

            return null;

        }


        return (
            cardInstance.abilities.find(
                ability =>
                    String(
                        ability.id
                    ) ===
                    String(
                        abilityId
                    )
            ) ||
            null
        );

    }


    /* ========================================================
       ABILITY VALIDATION
       ======================================================== */

    /*
     * Checks whether an ability can currently be used.
     *
     * This does NOT actually execute the ability.
     */
    function canUseAbility(
        cardInstance,
        abilityId,
        resources,
        context = {}
    ) {

        if (!cardInstance) {

            return {

                valid: false,

                error:
                    "CARD_NOT_FOUND"

            };

        }


        if (
            !cardInstance.inPlay
        ) {

            return {

                valid: false,

                error:
                    "CARD_NOT_IN_PLAY"

            };

        }


        const ability =
            getAbility(
                cardInstance,
                abilityId
            );


        if (!ability) {

            return {

                valid: false,

                error:
                    "ABILITY_NOT_FOUND"

            };

        }


        /*
         * Check resource requirements.
         */
        if (
            !hasResources(

                resources,

                ability.requiredResources

            )
        ) {

            return {

                valid: false,

                error:
                    "INSUFFICIENT_RESOURCES",

                requiredResources:
                    ability.requiredResources

            };

        }


        /*
         * Optional custom condition.
         *
         * This lets future cards add special rules without
         * rewriting the core ability system.
         */
        if (
            typeof context.canUseAbility ===
            "function"
        ) {

            const customResult =
                context.canUseAbility(

                    cardInstance,

                    ability,

                    context

                );


            if (
                customResult === false
            ) {

                return {

                    valid: false,

                    error:
                        "ABILITY_CONDITION_FAILED"

                };

            }


            if (
                customResult &&
                customResult.valid === false
            ) {

                return customResult;

            }

        }


        return {

            valid: true,

            ability

        };

    }


    /* ========================================================
       PLAY CARD VALIDATION
       ======================================================== */

    function canPlayCard(
        card,
        state,
        playerId
    ) {

        if (!card) {

            return {

                valid: false,

                error:
                    "CARD_NOT_FOUND"

            };

        }


        if (!state) {

            return {

                valid: false,

                error:
                    "GAME_STATE_NOT_FOUND"

            };

        }


        /*
         * Check hand.
         */
        const hand =
            Array.isArray(
                state.hand?.[playerId]
            )
                ? state.hand[playerId]
                : [];


        const cardId =
            normalizeCardId(
                card.id ??
                card.cardId
            );


        const handIndex =
            hand.findIndex(
                item =>
                    String(
                        typeof item === "string"
                            ? item
                            : item?.cardId ??
                              item?.id
                    ) ===
                    cardId
            );


        if (
            handIndex === -1
        ) {

            return {

                valid: false,

                error:
                    "CARD_NOT_IN_HAND"

            };

        }


        /*
         * Check board capacity.
         */
        const inPlay =
            Array.isArray(
                state.inPlay?.[playerId]
            )
                ? state.inPlay[playerId]
                : [];


        if (
            inPlay.length >=
            rules.maxCardsInPlay
        ) {

            return {

                valid: false,

                error:
                    "BOARD_FULL"

            };

        }


        return {

            valid: true,

            handIndex

        };

    }


    /* ========================================================
       PLAY CARD
       ======================================================== */

    /*
     * Moves a card from the player's hand into play.
     */
    function playCard(
        state,
        playerId,
        card,
        createInstance = createCardInstance
    ) {

        const validation =
            canPlayCard(
                card,
                state,
                playerId
            );


        if (
            !validation.valid
        ) {

            return validation;

        }


        const playerKey =
            String(
                playerId
            );


        /*
         * Ensure the required state collections exist.
         */
        if (
            !Array.isArray(
                state.hand[playerKey]
            )
        ) {

            state.hand[playerKey] = [];

        }


        if (
            !Array.isArray(
                state.inPlay[playerKey]
            )
        ) {

            state.inPlay[playerKey] = [];

        }


        /*
         * Remove the card from the hand.
         */
        const removed =
            state.hand[playerKey]
                .splice(
                    validation.handIndex,
                    1
                )[0];


        /*
         * Create a runtime card instance.
         */
        const instance =
            createInstance(
                card,
                playerId
            );


        if (!instance) {

            /*
             * Put the card back if instance creation failed.
             */
            state.hand[playerKey]
                .splice(

                    validation.handIndex,

                    0,

                    removed

                );


            return {

                valid: false,

                error:
                    "CARD_INSTANCE_FAILED"

            };

        }


        instance.inPlay = true;


        state.inPlay[playerKey]
            .push(
                instance
            );


        return {

            valid: true,

            card:
                instance

        };

    }


    /* ========================================================
       DRAW CARD
       ======================================================== */

    /*
     * Draw one card from a player's deck.
     *
     * The exact deck representation is deliberately flexible.
     */
    function drawCard(
        state,
        playerId
    ) {

        if (!state) {

            return {

                success: false,

                error:
                    "GAME_STATE_NOT_FOUND"

            };

        }


        const playerKey =
            String(
                playerId
            );


        if (
            !Array.isArray(
                state.deck?.[playerKey]
            )
        ) {

            return {

                success: false,

                error:
                    "DECK_NOT_FOUND"

            };

        }


        if (
            state.deck[playerKey].length ===
            0
        ) {

            return {

                success: false,

                error:
                    "DECK_EMPTY"

            };

        }


        if (
            Array.isArray(
                state.hand?.[playerKey]
            ) &&
            state.hand[playerKey].length >=
            rules.maxHandSize
        ) {

            return {

                success: false,

                error:
                    "HAND_FULL"

            };

        }


        const card =
            state.deck[playerKey]
                .shift();


        if (
            !Array.isArray(
                state.hand[playerKey]
            )
        ) {

            state.hand[playerKey] = [];

        }


        state.hand[playerKey]
            .push(
                card
            );


        /*
         * Drawing a card grants magik.
         *
         * This follows the current resource rules.
         */
        if (
            !state.resources
        ) {

            state.resources = {};

        }


        if (
            !state.resources[playerKey]
        ) {

            state.resources[playerKey] =
                createResourcePool();

        }


        addResource(

            state.resources[playerKey],

            "magik",

            1

        );


        return {

            success: true,

            card,

            resourceGain: {

                magik: 1

            }

        };

    }


    /* ========================================================
       DISCARD CARD
       ======================================================== */

    /*
     * Moves a card to the discard pile.
     *
     * Discarding a card grants one dark magik.
     */
    function discardCard(
        state,
        playerId,
        cardIndex
    ) {

        if (!state) {

            return {

                success: false,

                error:
                    "GAME_STATE_NOT_FOUND"

            };

        }


        const playerKey =
            String(
                playerId
            );


        if (
            !Array.isArray(
                state.hand?.[playerKey]
            )
        ) {

            return {

                success: false,

                error:
                    "HAND_NOT_FOUND"

            };

        }


        const index =
            Number(
                cardIndex
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


        if (
            !Array.isArray(
                state.discard
            )
        ) {

            state.discard = [];

        }


        state.discard.push(
            card
        );


        /*
         * Dark Magik is awarded when a card is discarded.
         */
        if (
            !state.resources
        ) {

            state.resources = {};

        }


        if (
            !state.resources[playerKey]
        ) {

            state.resources[playerKey] =
                createResourcePool();

        }


        addResource(

            state.resources[playerKey],

            "darkMagik",

            1

        );


        return {

            success: true,

            card,

            resourceGain: {

                darkMagik: 1

            }

        };

    }


    /* ========================================================
       DAMAGE
       ======================================================== */

    /*
     * Apply damage to a card.
     *
     * If the card is killed:
     *
     * - it is marked as defeated
     * - the owner can receive future death effects
     * - blood magik handling can occur
     */
    function damageCard(
        state,
        target,
        amount,
        source = null
    ) {

        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        const damage =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        const previousHP =
            Math.max(

                0,

                toNumber(
                    target.hp
                )

            );


        target.hp =
            clamp(

                previousHP -
                damage,

                rules.minimumHP,

                rules.maximumHP

            );


        const killed =
            target.hp <= 0;


        if (
            killed
        ) {

            target.hp = 0;

            target.defeated = true;

        }


        /*
         * A real battle state may need to remove defeated cards
         * from inPlay. That operation is kept outside this
         * low-level function so callers can decide exactly
         * what happens to defeated cards.
         */
        return {

            success: true,

            previousHP,

            damage,

            hp:
                target.hp,

            killed,

            source

        };

    }


    /* ========================================================
       HEALING
       ======================================================== */

    function healCard(
        target,
        amount
    ) {

        if (!target) {

            return {

                success: false,

                error:
                    "TARGET_NOT_FOUND"

            };

        }


        const healing =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        const previousHP =
            Math.max(

                0,

                toNumber(
                    target.hp
                )

            );


        const maxHP =
            clamp(

                toNumber(
                    target.maxHP,
                    rules.defaultCardHP
                ),

                rules.minimumHP,

                rules.maximumHP

            );


        target.maxHP =
            maxHP;


        target.hp =
            clamp(

                previousHP +
                healing,

                rules.minimumHP,

                maxHP

            );


        return {

            success: true,

            previousHP,

            healing,

            hp:
                target.hp,

            maxHP

        };

    }


    /* ========================================================
       BLOOD MAGIK
       ======================================================== */

    /*
     * Called when an entity is killed.
     *
     * Current rule:
     *
     *     gain 3 blood magik
     *
     * The exact player who receives it is supplied by the
     * caller because different effects may have different
     * ownership rules.
     */
    function grantKillBloodMagik(
        resources
    ) {

        if (!resources) {

            return {

                success: false

            };

        }


        addResource(

            resources,

            "bloodMagik",

            3

        );


        return {

            success: true,

            resourceGain: {

                bloodMagik: 3

            }

        };

    }


    /*
     * Called when a player takes bleed damage.
     *
     * Current rule:
     *
     *     gain 1 blood magik
     */
    function grantBleedBloodMagik(
        resources
    ) {

        if (!resources) {

            return {

                success: false

            };

        }


        addResource(

            resources,

            "bloodMagik",

            1

        );


        return {

            success: true,

            resourceGain: {

                bloodMagik: 1

            }

        };

    }


    /* ========================================================
       ASTRAL MAGIK
       ======================================================== */

    /*
     * Playing a card grants one astral magik.
     *
     * The amount can be overridden by a future effect.
     */
    function grantPlayAstralMagik(
        resources,
        amount = 1
    ) {

        if (!resources) {

            return {

                success: false

            };

        }


        const gain =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        addResource(

            resources,

            "astralMagik",

            gain

        );


        return {

            success: true,

            resourceGain: {

                astralMagik:
                    gain

            }

        };

    }


    /* ========================================================
       GILDED MAGIK
       ======================================================== */

    /*
     * Gilded Magik is effect-generated.
     *
     * Cards/effects can call this function whenever an effect
     * says the player should gain Gilded Magik.
     */
    function grantGildedMagik(
        resources,
        amount = 1
    ) {

        if (!resources) {

            return {

                success: false

            };

        }


        const gain =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        addResource(

            resources,

            "gildedMagik",

            gain

        );


        return {

            success: true,

            resourceGain: {

                gildedMagik:
                    gain

            }

        };

    }


    /* ========================================================
       GENERIC EFFECT RESOLUTION
       ======================================================== */

    /*
     * This handles simple standardized effects.
     *
     * More complicated card-specific effects can be added
     * later without changing the resource architecture.
     */
    function resolveEffect(
        state,
        effect,
        context = {}
    ) {

        if (!effect) {

            return {

                success: false,

                error:
                    "EFFECT_NOT_FOUND"

            };

        }


        const type =
            String(
                effect.type ||
                ""
            );


        /* ----------------------------------------------------
           DAMAGE
           ---------------------------------------------------- */

        if (
            type === "damage"
        ) {

            return damageCard(

                state,

                context.target,

                effect.amount,

                context.source

            );

        }


        /* ----------------------------------------------------
           HEAL
           ---------------------------------------------------- */

        if (
            type === "heal"
        ) {

            return healCard(

                context.target,

                effect.amount

            );

        }


        /* ----------------------------------------------------
           RESOURCE GAIN
           ---------------------------------------------------- */

        if (
            type ===
            "resource-gain"
        ) {

            if (
                !context.resources
            ) {

                return {

                    success: false,

                    error:
                        "RESOURCES_NOT_FOUND"

                };

            }


            const resourceName =
                effect.resource;


            const amount =
                Math.max(

                    0,

                    toNumber(
                        effect.amount
                    )

                );


            addResource(

                context.resources,

                resourceName,

                amount

            );


            return {

                success: true,

                resourceGain: {

                    [
                        resourceName
                    ]:
                        amount

                }

            };

        }


        /* ----------------------------------------------------
           RESOURCE LOSS
           ---------------------------------------------------- */

        if (
            type ===
            "resource-loss"
        ) {

            if (
                !context.resources
            ) {

                return {

                    success: false,

                    error:
                        "RESOURCES_NOT_FOUND"

                };

            }


            const resourceName =
                effect.resource;


            const amount =
                Math.max(

                    0,

                    toNumber(
                        effect.amount
                    )

                );


            if (
                !removeResource(

                    context.resources,

                    resourceName,

                    amount

                )
            ) {

                return {

                    success: false,

                    error:
                        "INSUFFICIENT_RESOURCES"

                };

            }


            return {

                success: true

            };

        }


        /* ----------------------------------------------------
           BLEED
           ---------------------------------------------------- */

        if (
            type ===
            "bleed"
        ) {

            /*
             * Bleed itself is represented as a status effect.
             *
             * Actual periodic damage can be handled by the
             * status-effect system later.
             */
            if (
                context.target
            ) {

                if (
                    !Array.isArray(
                        context.target.statusEffects
                    )
                ) {

                    context.target.statusEffects =
                        [];

                }


                context.target.statusEffects.push({

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

                        )

                });

            }


            return {

                success: true,

                statusEffect: "bleed"

            };

        }


        /* ----------------------------------------------------
           UNKNOWN EFFECT
           ---------------------------------------------------- */

        return {

            success: false,

            error:
                "UNKNOWN_EFFECT",

            effectType:
                type

        };

    }


    /* ========================================================
       RESOLVE ABILITY
       ======================================================== */

    /*
     * Executes an ability after validating and spending its
     * resource requirements.
     */
    function resolveAbility(
        state,
        cardInstance,
        abilityId,
        context = {}
    ) {

        const resources =
            context.resources ||
            null;


        const validation =
            canUseAbility(

                cardInstance,

                abilityId,

                resources,

                context

            );


        if (
            !validation.valid
        ) {

            return validation;

        }


        const ability =
            validation.ability;


        /*
         * Spend the ability's resources BEFORE executing
         * effects.
         *
         * This prevents an ability from being free simply
         * because the effect itself failed to process.
         */
        const payment =
            spendResources(

                resources,

                ability.requiredResources

            );


        if (
            !payment.success
        ) {

            return payment;

        }


        const effectResults = [];


        /*
         * Execute every effect in order.
         */
        for (
            const effect
            of ability.effects
        ) {

            const result =
                resolveEffect(

                    state,

                    effect,

                    context

                );


            effectResults.push(
                result
            );


            /*
             * If an effect fails, refund the ability cost.
             *
             * This gives us transactional behavior while the
             * more advanced effect engine is still being built.
             */
            if (
                !result.success
            ) {

                refundResources(

                    resources,

                    ability.requiredResources

                );


                return {

                    success: false,

                    error:
                        "ABILITY_EFFECT_FAILED",

                    effectResults

                };

            }

        }


        return {

            success: true,

            ability,

            effectResults,

            spentResources:
                ability.requiredResources

        };

    }


    /* ========================================================
       CARD PLAY RESOURCE REWARD
       ======================================================== */

    /*
     * Called after a card successfully enters play.
     *
     * Current rule:
     *
     *     playing a card grants Astral Magik.
     */
    function onCardPlayed(
        resources,
        amount = 1
    ) {

        return grantPlayAstralMagik(

            resources,

            amount

        );

    }


    /* ========================================================
       CARD DEATH HANDLING
       ======================================================== */

    function onEntityKilled(
        resources
    ) {

        return grantKillBloodMagik(
            resources
        );

    }


    /* ========================================================
       BLEED DAMAGE HANDLING
       ======================================================== */

    function onBleedDamageTaken(
        resources
    ) {

        return grantBleedBloodMagik(
            resources
        );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        rules,

        defaultResources,

        createResourcePool,

        getResource,

        addResource,

        removeResource,

        hasResources,

        spendResources,

        refundResources,

        getCardLimit,

        countCardCopies,

        validateDeck,

        createCardInstance,

        normalizeAbility,

        normalizeResourceRequirements,

        getAbility,

        canUseAbility,

        canPlayCard,

        playCard,

        drawCard,

        discardCard,

        damageCard,

        healCard,

        grantKillBloodMagik,

        grantBleedBloodMagik,

        grantPlayAstralMagik,

        grantGildedMagik,

        resolveEffect,

        resolveAbility,

        onCardPlayed,

        onEntityKilled,

        onBleedDamageTaken

    };

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createCardRules,

    DEFAULT_RULES,

    DEFAULT_RESOURCES

};
