/*
 * ============================================================
 * Card Stuff Yes
 * Resource System
 * ============================================================
 *
 * This module manages all player resources.
 *
 * Current resources:
 *
 * - magik
 * - astralMagik
 * - gildedMagik
 * - bloodMagik
 * - darkMagik
 *
 * IMPORTANT:
 *
 * Resources are intentionally dynamic.
 *
 * The game does NOT assume that these five resources are the
 * only resources that will ever exist.
 *
 * A future resource such as:
 *
 *     voidMagik
 *
 * can simply be added to a resource pool.
 *
 * ============================================================
 *
 * CURRENT RESOURCE RULES
 *
 * magik:
 *     Gained when drawing a card.
 *
 * astralMagik:
 *     Gained when playing a card.
 *
 * gildedMagik:
 *     Given by effects.
 *
 * bloodMagik:
 *     +3 when an entity is killed.
 *     +1 when bleed damage is taken.
 *
 * darkMagik:
 *     Gained when a card is discarded.
 *
 * ============================================================
 */


/* ============================================================
   DEFAULT RESOURCES
   ============================================================ */

const DEFAULT_RESOURCES = {

    magik: 0,

    astralMagik: 0,

    gildedMagik: 0,

    bloodMagik: 0,

    darkMagik: 0

};


/* ============================================================
   RESOURCE SYSTEM FACTORY
   ============================================================ */

function createResourceSystem(options = {}) {

    /*
     * Start with the game's standard resources.
     *
     * Additional resources supplied by another module are
     * automatically included.
     */
    const defaultResources = {

        ...DEFAULT_RESOURCES,

        ...(options.defaultResources || {})

    };


    /*
     * Optional maximum resource amounts.
     *
     * If a resource does not have a maximum, it has no
     * artificial maximum here.
     *
     * The actual game may introduce limits later.
     */
    const resourceMaximums = {

        ...(options.resourceMaximums || {})

    };


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

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


    function getMaximum(
        resourceName
    ) {

        const name =
            normalizeResourceName(
                resourceName
            );


        if (
            resourceMaximums[name] == null
        ) {

            return Infinity;

        }


        const maximum =
            Number(
                resourceMaximums[name]
            );


        if (
            !Number.isFinite(
                maximum
            )
        ) {

            return Infinity;

        }


        return Math.max(
            0,
            maximum
        );

    }


    function clampAmount(
        resourceName,
        amount
    ) {

        return Math.min(

            getMaximum(
                resourceName
            ),

            Math.max(
                0,
                toNumber(
                    amount
                )
            )

        );

    }


    /* ========================================================
       CREATE RESOURCE POOL
       ======================================================== */

    /*
     * Creates a fresh resource pool.
     *
     * Unknown resources are allowed.
     */
    function createPool(
        initialResources = {}
    ) {

        const resources = {};


        /*
         * Add all known default resources.
         */
        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                defaultResources
            )
        ) {

            resources[
                normalizeResourceName(
                    resourceName
                )
            ] =
                clampAmount(

                    resourceName,

                    amount

                );

        }


        /*
         * Copy supplied resources.
         *
         * This also adds future/custom resources.
         */
        if (
            initialResources &&
            typeof initialResources ===
            "object"
        ) {

            for (
                const [
                    resourceName,
                    amount
                ]
                of Object.entries(
                    initialResources
                )
            ) {

                resources[
                    normalizeResourceName(
                        resourceName
                    )
                ] =
                    clampAmount(

                        resourceName,

                        amount

                    );

            }

        }


        return resources;

    }


    /* ========================================================
       ENSURE RESOURCE EXISTS
       ======================================================== */

    /*
     * Makes sure a resource exists in a pool.
     *
     * Unknown resources are initialized to zero.
     */
    function ensureResource(
        resources,
        resourceName
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return false;

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        if (
            resources[name] == null
        ) {

            resources[name] = 0;

        }


        resources[name] =
            clampAmount(

                name,

                resources[name]

            );


        return true;

    }


    /* ========================================================
       GET RESOURCE
       ======================================================== */

    function get(
        resources,
        resourceName
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return 0;

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        ensureResource(
            resources,
            name
        );


        return resources[name];

    }


    /* ========================================================
       SET RESOURCE
       ======================================================== */

    function set(
        resources,
        resourceName,
        amount
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return {

                success: false,

                error:
                    "RESOURCES_NOT_FOUND"

            };

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        ensureResource(
            resources,
            name
        );


        const value =
            clampAmount(
                name,
                amount
            );


        const previous =
            resources[name];


        resources[name] =
            value;


        return {

            success: true,

            resource:
                name,

            previousAmount:
                previous,

            amount:
                value,

            change:
                value - previous

        };

    }


    /* ========================================================
       ADD RESOURCE
       ======================================================== */

    function add(
        resources,
        resourceName,
        amount = 1,
        metadata = {}
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return {

                success: false,

                error:
                    "RESOURCES_NOT_FOUND"

            };

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        const value =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        ensureResource(
            resources,
            name
        );


        const previous =
            resources[name];


        const result =
            set(

                resources,

                name,

                previous + value

            );


        if (
            !result.success
        ) {

            return result;

        }


        return {

            ...result,

            requestedAmount:
                value,

            reason:
                metadata.reason ||
                null,

            source:
                metadata.source ||
                null

        };

    }


    /* ========================================================
       REMOVE RESOURCE
       ======================================================== */

    function remove(
        resources,
        resourceName,
        amount = 1,
        metadata = {}
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return {

                success: false,

                error:
                    "RESOURCES_NOT_FOUND"

            };

        }


        const name =
            normalizeResourceName(
                resourceName
            );


        const value =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        ensureResource(
            resources,
            name
        );


        const current =
            resources[name];


        if (
            current < value
        ) {

            return {

                success: false,

                error:
                    "INSUFFICIENT_RESOURCES",

                resource:
                    name,

                required:
                    value,

                available:
                    current

            };

        }


        resources[name] =
            current - value;


        return {

            success: true,

            resource:
                name,

            previousAmount:
                current,

            amount:
                resources[name],

            spent:
                value,

            reason:
                metadata.reason ||
                null,

            source:
                metadata.source ||
                null

        };

    }


    /* ========================================================
       CHECK ONE REQUIREMENT
       ======================================================== */

    function has(
        resources,
        resourceName,
        amount
    ) {

        const required =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        return (
            get(
                resources,
                resourceName
            ) >=
            required
        );

    }


    /* ========================================================
       CHECK MULTIPLE REQUIREMENTS
       ======================================================== */

    /*
     * Example:
     *
     * {
     *     astralMagik: 2,
     *     bloodMagik: 1
     * }
     */
    function hasAll(
        resources,
        requirements = {}
    ) {

        if (
            !requirements ||
            typeof requirements !==
            "object"
        ) {

            return true;

        }


        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requirements
            )
        ) {

            if (
                !has(
                    resources,
                    resourceName,
                    amount
                )
            ) {

                return false;

            }

        }


        return true;

    }


    /* ========================================================
       FIND MISSING RESOURCES
       ======================================================== */

    /*
     * Returns exactly which resources are missing.
     *
     * Example result:
     *
     * {
     *     astralMagik: {
     *         required: 5,
     *         available: 2,
     *         missing: 3
     *     }
     * }
     */
    function getMissing(
        resources,
        requirements = {}
    ) {

        const missing = {};


        if (
            !requirements ||
            typeof requirements !==
            "object"
        ) {

            return missing;

        }


        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requirements
            )
        ) {

            const required =
                Math.max(

                    0,

                    toNumber(
                        amount
                    )

                );


            const available =
                get(
                    resources,
                    resourceName
                );


            if (
                available <
                required
            ) {

                missing[
                    normalizeResourceName(
                        resourceName
                    )
                ] = {

                    required,

                    available,

                    missing:
                        required -
                        available

                };

            }

        }


        return missing;

    }


    /* ========================================================
       SPEND MULTIPLE RESOURCES
       ======================================================== */

    /*
     * This is used for ability costs.
     *
     * The operation is transactional:
     *
     * 1. Check every resource.
     * 2. If anything is missing, spend nothing.
     * 3. Otherwise spend everything.
     */
    function spend(
        resources,
        requirements = {},
        metadata = {}
    ) {

        if (
            !hasAll(
                resources,
                requirements
            )
        ) {

            return {

                success: false,

                error:
                    "INSUFFICIENT_RESOURCES",

                missing:
                    getMissing(
                        resources,
                        requirements
                    )

            };

        }


        const spent = {};


        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requirements
            )
        ) {

            const result =
                remove(

                    resources,

                    resourceName,

                    amount,

                    metadata

                );


            if (
                !result.success
            ) {

                /*
                 * This should normally be impossible because
                 * hasAll() was checked first.
                 *
                 * Still, restore anything already spent to
                 * keep this operation transactional.
                 */
                for (
                    const [
                        spentName,
                        spentAmount
                    ]
                    of Object.entries(
                        spent
                    )
                ) {

                    add(

                        resources,

                        spentName,

                        spentAmount,

                        {

                            reason:
                                "transaction-refund",

                            source:
                                "resource-system"

                        }

                    );

                }


                return {

                    success: false,

                    error:
                        result.error

                };

            }


            spent[
                normalizeResourceName(
                    resourceName
                )
            ] =
                Math.max(

                    0,

                    toNumber(
                        amount
                    )

                );

        }


        return {

            success: true,

            spent,

            reason:
                metadata.reason ||
                null,

            source:
                metadata.source ||
                null

        };

    }


    /* ========================================================
       REFUND MULTIPLE RESOURCES
       ======================================================== */

    function refund(
        resources,
        requirements = {},
        metadata = {}
    ) {

        const refunded = {};


        for (
            const [
                resourceName,
                amount
            ]
            of Object.entries(
                requirements
            )
        ) {

            const value =
                Math.max(

                    0,

                    toNumber(
                        amount
                    )

                );


            add(

                resources,

                resourceName,

                value,

                {

                    ...metadata,

                    reason:
                        metadata.reason ||
                        "refund"

                }

            );


            refunded[
                normalizeResourceName(
                    resourceName
                )
            ] =
                value;

        }


        return {

            success: true,

            refunded

        };

    }


    /* ========================================================
       TRANSFER RESOURCE
       ======================================================== */

    /*
     * Transfers resources between two players/pools.
     *
     * This is useful for future cards that steal, donate, or
     * move resources between players.
     */
    function transfer(
        fromResources,
        toResources,
        resourceName,
        amount,
        metadata = {}
    ) {

        const value =
            Math.max(

                0,

                toNumber(
                    amount
                )

            );


        if (
            !has(
                fromResources,
                resourceName,
                value
            )
        ) {

            return {

                success: false,

                error:
                    "INSUFFICIENT_RESOURCES"

            };

        }


        const removed =
            remove(

                fromResources,

                resourceName,

                value,

                metadata

            );


        if (
            !removed.success
        ) {

            return removed;

        }


        const added =
            add(

                toResources,

                resourceName,

                value,

                metadata

            );


        if (
            !added.success
        ) {

            /*
             * Restore the source if the destination failed.
             */
            add(

                fromResources,

                resourceName,

                value,

                {

                    reason:
                        "transfer-refund",

                    source:
                        "resource-system"

                }

            );


            return {

                success: false,

                error:
                    "TRANSFER_FAILED"

            };

        }


        return {

            success: true,

            resource:
                normalizeResourceName(
                    resourceName
                ),

            amount:
                value

        };

    }


    /* ========================================================
       RESOURCE SNAPSHOT
       ======================================================== */

    /*
     * Creates a safe copy for sending to clients.
     */
    function snapshot(
        resources
    ) {

        if (
            !resources ||
            typeof resources !==
            "object"
        ) {

            return {};

        }


        return {

            ...resources

        };

    }


    /* ========================================================
       RESOURCE REWARDS
       ======================================================== */

    /*
     * Drawing a card grants one Magik.
     */
    function onCardDraw(
        resources,
        amount = 1
    ) {

        return add(

            resources,

            "magik",

            amount,

            {

                reason:
                    "card-drawn",

                source:
                    "resource-system"

            }

        );

    }


    /*
     * Playing a card grants one Astral Magik.
     */
    function onCardPlayed(
        resources,
        amount = 1
    ) {

        return add(

            resources,

            "astralMagik",

            amount,

            {

                reason:
                    "card-played",

                source:
                    "resource-system"

            }

        );

    }


    /*
     * Discarding a card grants one Dark Magik.
     */
    function onCardDiscarded(
        resources,
        amount = 1
    ) {

        return add(

            resources,

            "darkMagik",

            amount,

            {

                reason:
                    "card-discarded",

                source:
                    "resource-system"

            }

        );

    }


    /*
     * Killing an entity grants three Blood Magik.
     */
    function onEntityKilled(
        resources,
        amount = 3
    ) {

        return add(

            resources,

            "bloodMagik",

            amount,

            {

                reason:
                    "entity-killed",

                source:
                    "resource-system"

            }

        );

    }


    /*
     * Taking bleed damage grants one Blood Magik.
     */
    function onBleedDamageTaken(
        resources,
        amount = 1
    ) {

        return add(

            resources,

            "bloodMagik",

            amount,

            {

                reason:
                    "bleed-damage",

                source:
                    "resource-system"

            }

        );

    }


    /*
     * Gilded Magik is intentionally effect-driven.
     */
    function grantGildedMagik(
        resources,
        amount = 1
    ) {

        return add(

            resources,

            "gildedMagik",

            amount,

            {

                reason:
                    "effect",

                source:
                    "resource-system"

            }

        );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        defaultResources,

        resourceMaximums,

        createPool,

        ensureResource,

        get,

        set,

        add,

        remove,

        has,

        hasAll,

        getMissing,

        spend,

        refund,

        transfer,

        snapshot,

        onCardDraw,

        onCardPlayed,

        onCardDiscarded,

        onEntityKilled,

        onBleedDamageTaken,

        grantGildedMagik

    };

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createResourceSystem,

    DEFAULT_RESOURCES

};
