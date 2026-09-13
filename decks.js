/* ============================================================
   CARD STUFF YES — DECKS MODULE
   ============================================================

   This module manages player decks.

   It is responsible for:

   - Reading saved decks
   - Saving decks
   - Validating deck structure
   - Checking card ownership
   - Checking card limits
   - Checking deck size

   The actual card metadata will eventually come from the Set
   Manager/card system.

   ============================================================ */


/* ============================================================
   CREATE DECKS MODULE
   ============================================================ */

function createDecksModule(
    db,
    players,
    cardManager = null
) {

    if (!db) {

        throw new Error(
            "A database connection is required."
        );

    }


    if (!players) {

        throw new Error(
            "The players module is required."
        );

    }


    /* ========================================================
       SETTINGS
       ======================================================== */

    /*
     * This is deliberately kept as a configurable value.
     *
     * The final game's deck size can be changed later without
     * redesigning the module.
     */
    const DEFAULT_DECK_SIZE =
        20;


    const MAX_DECK_SIZE =
        100;


    /* ========================================================
       GET PLAYER DECK
       ======================================================== */

    function getDeck(
        playerId
    ) {

        return players.getPlayerDeck(
            playerId
        );

    }


    /* ========================================================
       SAVE PLAYER DECK
       ======================================================== */

    function saveDeck(
        playerId,
        cards
    ) {

        const validation =
            validateDeck(
                playerId,
                cards
            );


        if (!validation.valid) {

            return validation;

        }


        players.savePlayerDeck(
            playerId,
            cards
        );


        return {

            valid: true,

            deck:
                cards

        };

    }


    /* ========================================================
       CARD ID EXTRACTION
       ======================================================== */

    /*
     * The deck currently stores card IDs as strings.
     *
     * This function makes that expectation explicit.
     */
    function normalizeCardId(
        card
    ) {

        if (
            typeof card === "string"
        ) {

            return card.trim();

        }


        /*
         * Allow future deck representations such as:
         *
         *     { cardId: "S01-01" }
         */
        if (
            card &&
            typeof card === "object" &&
            typeof card.cardId === "string"
        ) {

            return card.cardId.trim();

        }


        return null;

    }


    /* ========================================================
       GET CARD LIMIT
       ======================================================== */

    /*
     * Ask the Set Manager/card system for the card's limit.
     *
     * If the card manager is not connected yet, use the default
     * limit of one copy.
     */
    function getCardLimit(
        cardId
    ) {

        if (
            cardManager &&
            typeof cardManager.getCardById ===
                "function"
        ) {

            const card =
                cardManager.getCardById(
                    cardId
                );


            if (
                card &&
                Number.isInteger(
                    card.cardLimit
                )
            ) {

                return card.cardLimit;

            }

        }


        return 1;

    }


    /* ========================================================
       CHECK DECK SIZE
       ======================================================== */

    function validateDeckSize(
        cards
    ) {

        if (
            cards.length >
            MAX_DECK_SIZE
        ) {

            return {

                valid: false,

                error:
                    `Deck cannot contain more than ${MAX_DECK_SIZE} cards.`

            };

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       CHECK CARD OWNERSHIP
       ======================================================== */

    function validateCardOwnership(
        playerId,
        cardId
    ) {

        if (
            !players.playerHasCard(
                playerId,
                cardId
            )
        ) {

            return {

                valid: false,

                error:
                    `Player does not own card ${cardId}.`

            };

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       CHECK CARD LIMITS
       ======================================================== */

    function validateCardLimits(
        cards
    ) {

        const counts =
            new Map();


        for (
            const cardId of cards
        ) {

            const currentCount =
                counts.get(
                    cardId
                ) || 0;


            const newCount =
                currentCount + 1;


            const cardLimit =
                getCardLimit(
                    cardId
                );


            if (
                newCount >
                cardLimit
            ) {

                return {

                    valid: false,

                    error:
                        `Card ${cardId} exceeds its deck limit of ${cardLimit}.`

                };

            }


            counts.set(
                cardId,
                newCount
            );

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       VALIDATE DECK
       ======================================================== */

    function validateDeck(
        playerId,
        cards
    ) {

        /* ----------------------------------------------------
           PLAYER
           ---------------------------------------------------- */

        const player =
            players.getPlayerById(
                playerId
            );


        if (!player) {

            return {

                valid: false,

                error:
                    "Player not found."

            };

        }


        /* ----------------------------------------------------
           ARRAY
           ---------------------------------------------------- */

        if (
            !Array.isArray(cards)
        ) {

            return {

                valid: false,

                error:
                    "Deck must be an array."

            };

        }


        /* ----------------------------------------------------
           EMPTY DECK
           ---------------------------------------------------- */

        if (
            cards.length === 0
        ) {

            return {

                valid: false,

                error:
                    "Deck cannot be empty."

            };

        }


        /* ----------------------------------------------------
           NORMALIZE CARD IDS
           ---------------------------------------------------- */

        const normalizedCards =
            cards.map(
                normalizeCardId
            );


        for (
            let index = 0;
            index < normalizedCards.length;
            index++
        ) {

            if (
                !normalizedCards[index]
            ) {

                return {

                    valid: false,

                    error:
                        `Invalid card at deck position ${index + 1}.`

                };

            }

        }


        /* ----------------------------------------------------
           DECK SIZE
           ---------------------------------------------------- */

        const sizeValidation =
            validateDeckSize(
                normalizedCards
            );


        if (
            !sizeValidation.valid
        ) {

            return sizeValidation;

        }


        /* ----------------------------------------------------
           CARD OWNERSHIP
           ---------------------------------------------------- */

        for (
            const cardId of normalizedCards
        ) {

            const ownership =
                validateCardOwnership(
                    playerId,
                    cardId
                );


            if (
                !ownership.valid
            ) {

                return ownership;

            }

        }


        /* ----------------------------------------------------
           CARD LIMITS
           ---------------------------------------------------- */

        const limitValidation =
            validateCardLimits(
                normalizedCards
            );


        if (
            !limitValidation.valid
        ) {

            return limitValidation;

        }


        /* ----------------------------------------------------
           SUCCESS
           ---------------------------------------------------- */

        return {

            valid: true,

            cards:
                normalizedCards,

            size:
                normalizedCards.length

        };

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        DEFAULT_DECK_SIZE,

        MAX_DECK_SIZE,

        getDeck,

        saveDeck,

        validateDeck,

        validateDeckSize,

        validateCardOwnership,

        validateCardLimits

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createDecksModule

};
