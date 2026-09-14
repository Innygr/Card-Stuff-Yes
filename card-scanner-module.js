/*
 * ============================================================
 * Card Stuff Yes
 * Card Scanner Module
 * ============================================================
 *
 * This module scans uploaded card PNG files.
 *
 * The scanner does NOT create cards automatically.
 *
 * Instead it:
 *
 * 1. Receives a PNG image.
 * 2. Runs OCR on the image.
 * 3. Looks for recognizable card fields.
 * 4. Converts the OCR result into card metadata.
 * 5. Returns the metadata to Set Manager.
 *
 * The Set Manager then lets the administrator review and
 * correct the information before saving the card.
 *
 *
 * IMPORTANT:
 *
 * This scanner intentionally does not try to understand every
 * pixel of the card artwork.
 *
 * It primarily looks for text.
 *
 * This works especially well when cards have a consistent
 * PowerPoint-created layout.
 *
 * ============================================================
 */


const fs = require("fs");
const path = require("path");


/* ============================================================
   OPTIONAL OCR DEPENDENCY
   ============================================================ */

let tesseract = null;

try {

    tesseract = require("tesseract.js");

} catch (error) {

    /*
     * We do not crash the entire server if the dependency has
     * not been installed yet.
     *
     * The scan endpoint will return a useful error instead.
     */

    tesseract = null;

}


/* ============================================================
   DEFAULT VALUES
   ============================================================ */

const DEFAULT_RARITIES = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary"
];


const RESOURCE_ALIASES = {

    "magik": "magik",

    "astral magik": "astralMagik",
    "astral magic": "astralMagik",

    "gilded magik": "gildedMagik",
    "gilded magic": "gildedMagik",

    "blood magik": "bloodMagik",
    "blood magic": "bloodMagik",

    "dark magik": "darkMagik",
    "dark magic": "darkMagik"

};


/* ============================================================
   createCardScanner
   ============================================================ */

function createCardScanner(options = {}) {

    const rarities =
        Array.isArray(options.rarities) &&
        options.rarities.length > 0
            ? options.rarities
            : DEFAULT_RARITIES;


    return {

        scanCard,

        parseOCRText,

        normalizeOCRText

    };


    /* ========================================================
       scanCard
       ======================================================== */

    async function scanCard(imagePath) {

        /*
         * Verify that the file exists before attempting OCR.
         */

        if (!imagePath) {

            throw new Error("No card image was supplied.");

        }


        if (!fs.existsSync(imagePath)) {

            throw new Error("The uploaded card image could not be found.");

        }


        /*
         * Only PNG files are accepted.
         */

        const extension =
            path.extname(imagePath).toLowerCase();


        if (extension !== ".png") {

            throw new Error("Card scanner only accepts PNG images.");

        }


        /*
         * Tesseract.js is required for OCR.
         */

        if (!tesseract) {

            throw new Error(
                "OCR is unavailable. Install Tesseract.js with: npm install tesseract.js"
            );

        }


        /*
         * Run OCR.
         *
         * English is used because the Card Stuff Yes card fields
         * are currently English.
         */

        const result =
            await tesseract.recognize(
                imagePath,
                "eng"
            );


        const rawText =
            result &&
            result.data &&
            typeof result.data.text === "string"
                ? result.data.text
                : "";


        const parsed =
            parseOCRText(rawText);


        return {

            success: true,

            rawText,

            confidence:
                result &&
                result.data &&
                typeof result.data.confidence === "number"
                    ? result.data.confidence
                    : null,

            card: parsed

        };

    }


    /* ========================================================
       parseOCRText
       ======================================================== */

    function parseOCRText(rawText) {

        const text =
            normalizeOCRText(rawText);


        const lines =
            text
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);


        const card = {

            name: "",

            setId: "",

            rarity: "",

            hp: null,

            power: null,

            cardLimit: 4,

            isSpecialEventCard: false,

            abilities: []

        };


        /*
         * ----------------------------------------------------
         * NAME
         * ----------------------------------------------------
         *
         * The scanner first looks for an explicit:
         *
         * Name: Something
         *
         * field.
         */

        const explicitName =
            findLabeledValue(
                lines,
                [
                    "card name",
                    "name"
                ]
            );


        if (explicitName) {

            card.name = cleanCardName(explicitName);

        } else {

            /*
             * If there is no "Name:" label, use the first
             * reasonably short line that does not look like a
             * known metadata field.
             */

            card.name =
                guessCardName(lines);

        }


        /* ----------------------------------------------------
           SET
           ---------------------------------------------------- */

        const setValue =
            findLabeledValue(
                lines,
                [
                    "set",
                    "set id",
                    "setid"
                ]
            );


        if (setValue) {

            card.setId =
                normalizeSetId(setValue);

        }


        /*
         * ----------------------------------------------------
         * RARITY
         * ----------------------------------------------------
         */

        const rarityValue =
            findLabeledValue(
                lines,
                [
                    "rarity"
                ]
            );


        if (rarityValue) {

            card.rarity =
                normalizeRarity(rarityValue);

        }


        if (!card.rarity) {

            card.rarity =
                detectRarity(text);

        }


        /*
         * ----------------------------------------------------
         * HP
         * ----------------------------------------------------
         */

        const hpValue =
            findLabeledNumber(
                lines,
                [
                    "hp",
                    "health",
                    "hit points",
                    "hitpoints"
                ]
            );


        if (hpValue !== null) {

            card.hp = hpValue;

        }


        /*
         * ----------------------------------------------------
         * POWER
         * ----------------------------------------------------
         */

        const powerValue =
            findLabeledNumber(
                lines,
                [
                    "power",
                    "attack",
                    "atk"
                ]
            );


        if (powerValue !== null) {

            card.power = powerValue;

        }


        /*
         * ----------------------------------------------------
         * CARD LIMIT
         * ----------------------------------------------------
         */

        const cardLimitValue =
            findLabeledNumber(
                lines,
                [
                    "card limit",
                    "limit",
                    "copy limit",
                    "copies"
                ]
            );


        if (cardLimitValue !== null) {

            card.cardLimit =
                clamp(
                    cardLimitValue,
                    1,
                    999
                );

        }


        /*
         * ----------------------------------------------------
         * SPECIAL EVENT CARD
         * ----------------------------------------------------
         *
         * Several common textual forms are accepted.
         */

        card.isSpecialEventCard =
            detectSpecialEventCard(
                text
            );


        /*
         * ----------------------------------------------------
         * ABILITIES
         * ----------------------------------------------------
         */

        card.abilities =
            detectAbilities(
                lines
            );


        return card;

    }


    /* ========================================================
       normalizeOCRText
       ======================================================== */

    function normalizeOCRText(rawText) {

        if (typeof rawText !== "string") {

            return "";

        }


        return rawText

            /*
             * Normalize line endings.
             */

            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")

            /*
             * OCR frequently produces excessive spaces.
             */

            .replace(/[ \t]+/g, " ")

            /*
             * Remove repeated blank lines.
             */

            .replace(/\n{3,}/g, "\n\n")

            .trim();

    }


    /* ========================================================
       findLabeledValue
       ======================================================== */

    function findLabeledValue(lines, labels) {

        for (const line of lines) {

            const normalized =
                line
                    .toLowerCase()
                    .trim();


            for (const label of labels) {

                const escaped =
                    escapeRegExp(label);


                const expression =
                    new RegExp(
                        "^" +
                        escaped +
                        "\\s*[:\\-]?\\s*(.+)$",
                        "i"
                    );


                const match =
                    normalized.match(expression);


                if (match && match[1]) {

                    return match[1].trim();

                }

            }

        }


        return "";

    }


    /* ========================================================
       findLabeledNumber
       ======================================================== */

    function findLabeledNumber(lines, labels) {

        const value =
            findLabeledValue(
                lines,
                labels
            );


        if (!value) {

            return null;

        }


        const match =
            value.match(
                /-?\d+(?:\.\d+)?/
            );


        if (!match) {

            return null;

        }


        const number =
            Number(match[0]);


        if (!Number.isFinite(number)) {

            return null;

        }


        return Math.round(number);

    }


    /* ========================================================
       guessCardName
       ======================================================== */

    function guessCardName(lines) {

        for (const line of lines) {

            const clean =
                line.trim();


            if (
                clean.length < 2 ||
                clean.length > 60
            ) {

                continue;

            }


            const lower =
                clean.toLowerCase();


            /*
             * Ignore obvious metadata.
             */

            if (
                lower.startsWith("hp") ||
                lower.startsWith("health") ||
                lower.startsWith("power") ||
                lower.startsWith("attack") ||
                lower.startsWith("rarity") ||
                lower.startsWith("set") ||
                lower.startsWith("limit") ||
                lower.startsWith("card limit") ||
                lower.startsWith("ability") ||
                lower.startsWith("special event")
            ) {

                continue;

            }


            /*
             * Ignore lines containing mostly numbers.
             */

            const letters =
                clean.replace(
                    /[^a-zA-Z]/g,
                    ""
                );


            if (letters.length < 2) {

                continue;

            }


            return clean;

        }


        return "";

    }


    /* ========================================================
       cleanCardName
       ======================================================== */

    function cleanCardName(value) {

        return value

            .replace(
                /^["']|["']$/g,
                ""
            )

            .replace(
                /\s{2,}/g,
                " "
            )

            .trim();

    }


    /* ========================================================
       normalizeSetId
       ======================================================== */

    function normalizeSetId(value) {

        const match =
            String(value)
                .toUpperCase()
                .match(
                    /S\d{1,4}/
                );


        if (!match) {

            return String(value)
                .trim();

        }


        return match[0];

    }


    /* ========================================================
       normalizeRarity
       ======================================================== */

    function normalizeRarity(value) {

        const lower =
            String(value)
                .toLowerCase()
                .trim();


        for (const rarity of rarities) {

            if (
                lower === rarity.toLowerCase()
            ) {

                return rarity;

            }

        }


        return "";

    }


    /* ========================================================
       detectRarity
       ======================================================== */

    function detectRarity(text) {

        const lower =
            text.toLowerCase();


        /*
         * Check longest names first.
         */

        const ordered =
            [...rarities]
                .sort(
                    (a, b) =>
                        b.length - a.length
                );


        for (const rarity of ordered) {

            if (
                lower.includes(
                    rarity.toLowerCase()
                )
            ) {

                return rarity;

            }

        }


        return "";

    }


    /* ========================================================
       detectSpecialEventCard
       ======================================================== */

    function detectSpecialEventCard(text) {

        const lower =
            text.toLowerCase();


        const positivePatterns = [

            "special event",

            "special event card",

            "event card",

            "mission reward",

            "mission card",

            "mod granted",

            "mod granted card",

            "special card"

        ];


        for (const pattern of positivePatterns) {

            if (
                lower.includes(pattern)
            ) {

                return true;

            }

        }


        /*
         * Explicit false values should remain false.
         */

        return false;

    }


    /* ========================================================
       detectAbilities
       ======================================================== */

    function detectAbilities(lines) {

        const abilities = [];

        let currentAbility = null;


        for (let index = 0; index < lines.length; index++) {

            const line =
                lines[index];


            const lower =
                line.toLowerCase();


            /*
             * Look for:
             *
             * Ability: Something
             * Ability 1: Something
             * Move: Something
             * Move 1: Something
             */

            const abilityMatch =
                line.match(
                    /^(?:ability|move)\s*\d*\s*[:\-]\s*(.+)$/i
                );


            if (abilityMatch) {

                if (currentAbility) {

                    abilities.push(
                        currentAbility
                    );

                }


                currentAbility = {

                    id:
                        `ability-${abilities.length + 1}`,

                    name:
                        abilityMatch[1].trim(),

                    requiredResources: {},

                    effects: []

                };


                continue;

            }


            /*
             * Some cards may simply have:
             *
             * 1. Quick Strike
             * 2. Healing Bloom
             *
             * Detect those too.
             */

            const numberedMatch =
                line.match(
                    /^\d+[\.\)]\s*(.{2,60})$/
                );


            if (
                numberedMatch &&
                !/\d+\s*(?:hp|power)/i.test(
                    numberedMatch[1]
                )
            ) {

                if (currentAbility) {

                    abilities.push(
                        currentAbility
                    );

                }


                currentAbility = {

                    id:
                        `ability-${abilities.length + 1}`,

                    name:
                        numberedMatch[1].trim(),

                    requiredResources: {},

                    effects: []

                };


                continue;

            }


            /*
             * Look for resource costs.
             *
             * Example:
             *
             * Astral Magik: 2
             * Blood Magik 3
             */

            const resourceMatch =
                line.match(
                    /^(.+?)\s*[:\-]\s*(\d+)$/i
                );


            if (
                currentAbility &&
                resourceMatch
            ) {

                const resourceName =
                    resourceMatch[1]
                        .trim()
                        .toLowerCase();


                const canonicalResource =
                    RESOURCE_ALIASES[
                        resourceName
                    ];


                if (canonicalResource) {

                    currentAbility
                        .requiredResources[
                            canonicalResource
                        ] =
                            Number(
                                resourceMatch[2]
                            );

                }

            }


            /*
             * Also detect inline resource costs:
             *
             * "Astral Magik 2"
             */

            if (currentAbility) {

                for (
                    const [
                        resourceName,
                        canonicalResource
                    ]
                    of Object.entries(
                        RESOURCE_ALIASES
                    )
                ) {

                    const expression =
                        new RegExp(
                            escapeRegExp(resourceName) +
                            "\\s*[:\\-]?\\s*(\\d+)",
                            "i"
                        );


                    const match =
                        line.match(
                            expression
                        );


                    if (match) {

                        currentAbility
                            .requiredResources[
                                canonicalResource
                            ] =
                                Number(
                                    match[1]
                                );

                    }

                }

            }


            /*
             * Effects are intentionally not automatically
             * converted into game effects here.
             *
             * OCR cannot reliably determine whether:
             *
             * "Deal 20 damage"
             *
             * means damage, direct damage, an effect,
             * conditional damage, etc.
             *
             * We therefore preserve the text as an effect
             * description.
             */

            if (
                currentAbility &&
                (
                    lower.startsWith("deal ") ||
                    lower.startsWith("damage ") ||
                    lower.startsWith("heal ") ||
                    lower.startsWith("draw ") ||
                    lower.startsWith("discard ") ||
                    lower.startsWith("gain ") ||
                    lower.startsWith("give ") ||
                    lower.startsWith("destroy ") ||
                    lower.startsWith("stun ")
                )
            ) {

                currentAbility.effects.push({

                    type: "description",

                    text: line

                });

            }

        }


        if (currentAbility) {

            abilities.push(
                currentAbility
            );

        }


        return abilities;

    }


    /* ========================================================
       Utility functions
       ======================================================== */

    function clamp(value, min, max) {

        return Math.min(
            max,
            Math.max(
                min,
                value
            )
        );

    }


    function escapeRegExp(value) {

        return String(value)
            .replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

    }

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createCardScanner

};
