/*
 * ============================================================
 * CARD STUFF YES
 * SERVER SET MANAGER MODULE
 * ============================================================
 *
 * This module manages:
 *
 * - Card sets
 * - Set release dates
 * - Set release times
 * - Set cover images
 * - Cards
 * - Card images
 * - Card HP
 * - Card power
 * - Card rarity
 * - Card abilities
 * - Ability resource requirements
 * - Ability effects
 * - Card limits
 * - Special-event cards
 * - Automatic card IDs
 * - Public released-card APIs
 *
 * IMPORTANT:
 *
 * A set does NOT get its own folder.
 *
 * Set covers are stored as:
 *
 *     S01-cover.png
 *
 * Cards are stored as:
 *
 *     S01-01.png
 *     S01-02.png
 *     S01-03.png
 *
 * Card metadata is stored in:
 *
 *     cards.json
 *
 * Set metadata is stored in:
 *
 *     sets.json
 *
 * ============================================================
 */


/* ============================================================
   IMPORTS
   ============================================================ */

const fs = require("fs");
const path = require("path");


/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_TIME_ZONE =
    "America/Vancouver";


const MAX_UPLOAD_SIZE =
    20 * 1024 * 1024;


/*
 * These are the currently supported rarities.
 *
 * More can be added later if the game needs them.
 */

const VALID_RARITIES = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary"
];


/*
 * These are deliberately NOT used as the list of valid
 * resources.
 *
 * Resources are data-driven so new resources can be added
 * later without changing this module.
 */


/* ============================================================
   RESOURCE VALIDATION
   ============================================================ */

/*
 * Resource IDs are intentionally flexible.
 *
 * This allows future resources such as:
 *
 *     magik
 *     astralMagik
 *     gildedMagik
 *     bloodMagik
 *     darkMagik
 *     futureMagik
 *
 * without requiring a code update here.
 */

function isValidResourceID(resourceID) {

    return (
        typeof resourceID === "string" &&
        /^[A-Za-z][A-Za-z0-9_-]*$/.test(resourceID)
    );

}


/* ============================================================
   NUMBER HELPERS
   ============================================================ */

function isInteger(value) {

    return (
        typeof value === "number" &&
        Number.isInteger(value)
    );

}


function requireInteger(
    value,
    fieldName,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {

    if (!isInteger(value)) {

        throw new Error(
            `${fieldName} must be an integer.`
        );

    }


    if (
        value < minimum ||
        value > maximum
    ) {

        throw new Error(
            `${fieldName} must be between ${minimum} and ${maximum}.`
        );

    }


    return value;

}


/* ============================================================
   STRING HELPERS
   ============================================================ */

function requireString(
    value,
    fieldName,
    minimumLength = 1,
    maximumLength = 1000
) {

    if (
        typeof value !== "string" ||
        value.length < minimumLength ||
        value.length > maximumLength
    ) {

        throw new Error(
            `${fieldName} must be a string between ` +
            `${minimumLength} and ${maximumLength} characters.`
        );

    }


    return value;

}


/* ============================================================
   ID VALIDATION
   ============================================================ */

function validateSetID(setID) {

    if (
        typeof setID !== "string" ||
        !/^S\d{2,}$/.test(setID)
    ) {

        throw new Error(
            "Set ID must look like S01, S02, S03, etc."
        );

    }


    return setID;

}


/* ============================================================
   SET ID GENERATION
   ============================================================ */

function getNextSetID(sets) {

    let highest =
        0;


    for (
        const set of sets
    ) {

        if (
            typeof set.id !== "string"
        ) {

            continue;

        }


        const match =
            /^S(\d+)$/.exec(
                set.id
            );


        if (!match) {

            continue;

        }


        const number =
            Number(
                match[1]
            );


        if (
            number > highest
        ) {

            highest =
                number;

        }

    }


    return (
        "S" +
        String(
            highest + 1
        ).padStart(
            2,
            "0"
        )
    );

}


/* ============================================================
   CARD ID GENERATION
   ============================================================ */

function getNextCardID(
    cards,
    setID
) {

    let highest =
        0;


    const prefix =
        `${setID}-`;


    for (
        const card of cards
    ) {

        if (
            typeof card.id !== "string"
        ) {

            continue;

        }


        if (
            !card.id.startsWith(prefix)
        ) {

            continue;

        }


        const numberPart =
            card.id.slice(
                prefix.length
            );


        const number =
            Number(
                numberPart
            );


        if (
            Number.isInteger(number) &&
            number > highest
        ) {

            highest =
                number;

        }

    }


    return (
        `${setID}-` +
        String(
            highest + 1
        ).padStart(
            2,
            "0"
        )
    );

}


/* ============================================================
   DATE VALIDATION
   ============================================================ */

/*
 * The Set Manager uses:
 *
 *     MM-DD-YYYY
 *
 * for release dates.
 */

function validateReleaseDate(
    releaseDate
) {

    requireString(
        releaseDate,
        "releaseDate",
        10,
        10
    );


    if (
        !/^\d{2}-\d{2}-\d{4}$/.test(
            releaseDate
        )
    ) {

        throw new Error(
            "releaseDate must use MM-DD-YYYY format."
        );

    }


    const [
        month,
        day,
        year
    ] =
        releaseDate
            .split("-")
            .map(Number);


    const date =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );


    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {

        throw new Error(
            "releaseDate is not a valid calendar date."
        );

    }


    return releaseDate;

}


/* ============================================================
   RELEASE TIME VALIDATION
   ============================================================ */

function validateReleaseTime(
    releaseTime
) {

    requireString(
        releaseTime,
        "releaseTime",
        5,
        5
    );


    if (
        !/^\d{2}:\d{2}$/.test(
            releaseTime
        )
    ) {

        throw new Error(
            "releaseTime must use HH:MM format."
        );

    }


    const [
        hour,
        minute
    ] =
        releaseTime
            .split(":")
            .map(Number);


    if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {

        throw new Error(
            "releaseTime must contain a valid 24-hour time."
        );

    }


    return releaseTime;

}


/* ============================================================
   TIME ZONE
   ============================================================ */

function getTimeZone() {

    return DEFAULT_TIME_ZONE;

}


/* ============================================================
   RELEASE DATE/TIME
   ============================================================ */

function getReleaseDateTime(
    set
) {

    const [
        month,
        day,
        year
    ] =
        set.releaseDate
            .split("-");


    const [
        hour,
        minute
    ] =
        set.releaseTime
            .split(":");


    /*
     * The set manager stores the intended Pacific-time
     * release information.
     *
     * A full timezone conversion can be performed by the
     * application layer if needed.
     */

    return {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        timeZone:
            getTimeZone()
    };

}


/* ============================================================
   ABILITY RESOURCE VALIDATION
   ============================================================ */

/*
 * requiredResources is an object:
 *
 * {
 *     "astralMagik": 2,
 *     "bloodMagik": 1
 * }
 *
 * This is attached to the ABILITY rather than the card.
 */

function validateRequiredResources(
    requiredResources
) {

    if (
        requiredResources === undefined ||
        requiredResources === null
    ) {

        return {};

    }


    if (
        typeof requiredResources !== "object" ||
        Array.isArray(requiredResources)
    ) {

        throw new Error(
            "requiredResources must be an object."
        );

    }


    const result =
        {};


    for (
        const [
            resourceID,
            amount
        ]
        of Object.entries(
            requiredResources
        )
    ) {

        if (
            !isValidResourceID(
                resourceID
            )
        ) {

            throw new Error(
                `Invalid resource ID: ${resourceID}`
            );

        }


        requireInteger(
            amount,
            `requiredResources.${resourceID}`,
            0,
            999999
        );


        /*
         * Zero-cost entries are unnecessary.
         *
         * Remove them from the saved data.
         */

        if (
            amount > 0
        ) {

            result[
                resourceID
            ] =
                amount;

        }

    }


    return result;

}


/* ============================================================
   ABILITY EFFECT VALIDATION
   ============================================================ */

/*
 * Effects are currently intentionally flexible.
 *
 * The Set Manager stores them as structured data, while
 * card-rules.js will eventually determine what the effects
 * actually DO.
 *
 * Example:
 *
 * {
 *     "type": "damage",
 *     "amount": 20
 * }
 *
 * or:
 *
 * {
 *     "type": "gainResource",
 *     "resource": "gildedMagik",
 *     "amount": 2
 * }
 *
 * Keeping this generic lets us add effects later.
 */

function validateAbilityEffects(
    effects
) {

    if (
        effects === undefined ||
        effects === null
    ) {

        return [];

    }


    if (
        !Array.isArray(effects)
    ) {

        throw new Error(
            "Ability effects must be an array."
        );

    }


    if (
        effects.length > 100
    ) {

        throw new Error(
            "An ability cannot contain more than 100 effects."
        );

    }


    return effects.map(
        (
            effect,
            index
        ) => {

            if (
                typeof effect !== "object" ||
                effect === null ||
                Array.isArray(effect)
            ) {

                throw new Error(
                    `Ability effect ${index + 1} must be an object.`
                );

            }


            /*
             * We intentionally preserve the effect object.
             *
             * The gameplay engine will perform the deeper
             * validation when it knows the actual effect types.
             */

            return {
                ...effect
            };

        }
    );

}


/* ============================================================
   ABILITY VALIDATION
   ============================================================ */

function validateAbility(
    ability,
    index
) {

    if (
        typeof ability !== "object" ||
        ability === null ||
        Array.isArray(ability)
    ) {

        throw new Error(
            `Ability ${index + 1} must be an object.`
        );

    }


    const name =
        requireString(
            ability.name,
            `Ability ${index + 1} name`,
            1,
            100
        );


    /*
     * Ability IDs are generated automatically if one isn't
     * provided.
     */

    let id =
        ability.id;


    if (
        id === undefined ||
        id === null ||
        id === ""
    ) {

        id =
            `ability-${index + 1}`;

    }


    requireString(
        id,
        `Ability ${index + 1} ID`,
        1,
        100
    );


    const requiredResources =
        validateRequiredResources(
            ability.requiredResources
        );


    const effects =
        validateAbilityEffects(
            ability.effects
        );


    return {

        id,

        name,

        requiredResources,

        effects

    };

}


/* ============================================================
   ABILITY LIST VALIDATION
   ============================================================ */

function validateAbilities(
    abilities
) {

    if (
        abilities === undefined ||
        abilities === null
    ) {

        return [];

    }


    if (
        !Array.isArray(abilities)
    ) {

        throw new Error(
            "abilities must be an array."
        );

    }


    if (
        abilities.length > 50
    ) {

        throw new Error(
            "A card cannot contain more than 50 abilities."
        );

    }


    const validated =
        abilities.map(
            (
                ability,
                index
            ) =>
                validateAbility(
                    ability,
                    index
                )
        );


    /*
     * Ability IDs must be unique within a card.
     */

    const IDs =
        new Set();


    for (
        const ability
        of validated
    ) {

        if (
            IDs.has(
                ability.id
            )
        ) {

            throw new Error(
                `Duplicate ability ID: ${ability.id}`
            );

        }


        IDs.add(
            ability.id
        );

    }


    return validated;

}


/* ============================================================
   CARD DATA VALIDATION
   ============================================================ */

function validateCardData(
    data
) {

    if (
        typeof data !== "object" ||
        data === null ||
        Array.isArray(data)
    ) {

        throw new Error(
            "Card data must be an object."
        );

    }


    const name =
        requireString(
            data.name,
            "Card name",
            1,
            200
        );


    const setId =
        validateSetID(
            data.setId
        );


    const rarity =
        requireString(
            data.rarity,
            "Card rarity",
            1,
            30
        ).toLowerCase();


    if (
        !VALID_RARITIES.includes(
            rarity
        )
    ) {

        throw new Error(
            `Invalid rarity: ${rarity}`
        );

    }


    const power =
        requireInteger(
            data.power,
            "Card power",
            0,
            999999
        );


    /*
     * HP is now a required card stat.
     */

    const hp =
        requireInteger(
            data.hp,
            "Card HP",
            1,
            999999
        );


    const cardLimit =
        data.cardLimit === undefined
            ? 4
            : requireInteger(
                data.cardLimit,
                "cardLimit",
                1,
                999
            );


    const isSpecialEventCard =
        data.isSpecialEventCard === undefined
            ? false
            : Boolean(
                data.isSpecialEventCard
            );


    const abilities =
        validateAbilities(
            data.abilities
        );


    return {

        name,

        setId,

        rarity,

        power,

        hp,

        abilities,

        cardLimit,

        isSpecialEventCard

    };

}


/* ============================================================
   PNG VALIDATION
   ============================================================ */

function isPNG(
    buffer
) {

    if (
        !Buffer.isBuffer(buffer)
    ) {

        return false;

    }


    if (
        buffer.length < 8
    ) {

        return false;

    }


    const PNG_SIGNATURE =
        Buffer.from([
            0x89,
            0x50,
            0x4E,
            0x47,
            0x0D,
            0x0A,
            0x1A,
            0x0A
        ]);


    return buffer
        .subarray(
            0,
            8
        )
        .equals(
            PNG_SIGNATURE
        );

}


/* ============================================================
   SAFE FILE NAME
   ============================================================ */

function safeFileName(
    fileName
) {

    return path.basename(
        fileName
    );

}


/* ============================================================
   JSON FILE HELPERS
   ============================================================ */

function ensureJSONFile(
    filePath,
    defaultValue
) {

    if (
        !fs.existsSync(
            filePath
        )
    ) {

        fs.writeFileSync(
            filePath,
            JSON.stringify(
                defaultValue,
                null,
                4
            ),
            "utf8"
        );

    }

}


function readJSONFile(
    filePath,
    defaultValue
) {

    ensureJSONFile(
        filePath,
        defaultValue
    );


    try {

        const text =
            fs.readFileSync(
                filePath,
                "utf8"
            );


        const parsed =
            JSON.parse(
                text
            );


        return parsed;

    }
    catch (
        error
    ) {

        throw new Error(
            `Could not read ${path.basename(filePath)}: ` +
            error.message
        );

    }

}


function writeJSONFile(
    filePath,
    value
) {

    const temporaryPath =
        `${filePath}.tmp`;


    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(
            value,
            null,
            4
        ),
        "utf8"
    );


    fs.renameSync(
        temporaryPath,
        filePath
    );

}


/* ============================================================
   CREATE SET MANAGER
   ============================================================ */

function createSetManager(
    options = {}
) {

    /*
     * The module can be configured by server.js.
     */

    const rootDirectory =
        options.rootDirectory ||
        path.resolve(
            __dirname,
            ".."
        );


    const cardsDirectory =
        options.cardsDirectory ||
        path.join(
            rootDirectory,
            "cards"
        );


    const setsFile =
        options.setsFile ||
        path.join(
            rootDirectory,
            "sets.json"
        );


    const cardsFile =
        options.cardsFile ||
        path.join(
            rootDirectory,
            "cards.json"
        );


    const permissionCheck =
        typeof options.permissionCheck === "function"
            ? options.permissionCheck
            : (
                () => false
            );


    fs.mkdirSync(
        cardsDirectory,
        {
            recursive: true
        }
    );


    ensureJSONFile(
        setsFile,
        []
    );


    ensureJSONFile(
        cardsFile,
        []
    );


    /* ========================================================
       INTERNAL LOADERS
       ======================================================== */

    function loadSets() {

        const sets =
            readJSONFile(
                setsFile,
                []
            );


        if (
            !Array.isArray(sets)
        ) {

            throw new Error(
                "sets.json must contain an array."
            );

        }


        return sets;

    }


    function loadCards() {

        const cards =
            readJSONFile(
                cardsFile,
                []
            );


        if (
            !Array.isArray(cards)
        ) {

            throw new Error(
                "cards.json must contain an array."
            );

        }


        return cards;

    }


    function saveSets(
        sets
    ) {

        writeJSONFile(
            setsFile,
            sets
        );

    }


    function saveCards(
        cards
    ) {

        writeJSONFile(
            cardsFile,
            cards
        );

    }


    /* ========================================================
       PERMISSION CHECK
       ======================================================== */

    function requireManagerPermission(
        context
    ) {

        const allowed =
            permissionCheck(
                context
            );


        if (
            !allowed
        ) {

            throw new Error(
                "Only the Owner or Moderator can use Set Manager."
            );

        }

    }


    /* ========================================================
       CREATE SET
       ======================================================== */

    function createSet(
        data,
        context
    ) {

        requireManagerPermission(
            context
        );


        if (
            typeof data !== "object" ||
            data === null
        ) {

            throw new Error(
                "Set data must be an object."
            );

        }


        const sets =
            loadSets();


        let id =
            data.id;


        if (
            id === undefined ||
            id === null ||
            id === ""
        ) {

            id =
                getNextSetID(
                    sets
                );

        }
        else {

            validateSetID(
                id
            );

        }


        if (
            sets.some(
                set =>
                    set.id === id
            )
        ) {

            throw new Error(
                `Set ${id} already exists.`
            );

        }


        const displayName =
            requireString(
                data.displayName,
                "displayName",
                1,
                200
            );


        const releaseDate =
            validateReleaseDate(
                data.releaseDate
            );


        const releaseTime =
            validateReleaseTime(
                data.releaseTime
            );


        const set = {

            id,

            displayName,

            releaseDate,

            releaseTime,

            timeZone:
                getTimeZone(),

            coverFile:
                `${id}-cover.png`,

            createdAt:
                new Date().toISOString()

        };


        sets.push(
            set
        );


        saveSets(
            sets
        );


        return {
            ...set
        };

    }


    /* ========================================================
       UPDATE SET
       ======================================================== */

    function updateSet(
        setID,
        data,
        context
    ) {

        requireManagerPermission(
            context
        );


        validateSetID(
            setID
        );


        const sets =
            loadSets();


        const set =
            sets.find(
                item =>
                    item.id === setID
            );


        if (
            !set
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }


        if (
            data.displayName !== undefined
        ) {

            set.displayName =
                requireString(
                    data.displayName,
                    "displayName",
                    1,
                    200
                );

        }


        if (
            data.releaseDate !== undefined
        ) {

            set.releaseDate =
                validateReleaseDate(
                    data.releaseDate
                );

        }


        if (
            data.releaseTime !== undefined
        ) {

            set.releaseTime =
                validateReleaseTime(
                    data.releaseTime
                );

        }


        /*
         * The timezone is intentionally fixed to Pacific Time.
         */

        set.timeZone =
            getTimeZone();


        set.updatedAt =
            new Date().toISOString();


        saveSets(
            sets
        );


        return {
            ...set
        };

    }


    /* ========================================================
       DELETE SET
       ======================================================== */

    function deleteSet(
        setID,
        context
    ) {

        requireManagerPermission(
            context
        );


        validateSetID(
            setID
        );


        const sets =
            loadSets();


        const cards =
            loadCards();


        const hasCards =
            cards.some(
                card =>
                    card.setId === setID
            );


        /*
         * We do NOT allow deleting a set while cards still
         * belong to it.
         */

        if (
            hasCards
        ) {

            throw new Error(
                "Cannot delete a set while cards still belong to it."
            );

        }


        const index =
            sets.findIndex(
                set =>
                    set.id === setID
            );


        if (
            index === -1
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }


        const [
            removed
        ] =
            sets.splice(
                index,
                1
            );


        saveSets(
            sets
        );


        /*
         * Delete the cover if one exists.
         */

        const coverPath =
            path.join(
                cardsDirectory,
                `${setID}-cover.png`
            );


        if (
            fs.existsSync(
                coverPath
            )
        ) {

            fs.unlinkSync(
                coverPath
            );

        }


        return {
            ...removed
        };

    }


    /* ========================================================
       UPLOAD SET COVER
       ======================================================== */

    function uploadSetCover(
        setID,
        imageBuffer,
        context
    ) {

        requireManagerPermission(
            context
        );


        validateSetID(
            setID
        );


        if (
            !Buffer.isBuffer(
                imageBuffer
            )
        ) {

            throw new Error(
                "Set cover must be a Buffer."
            );

        }


        if (
            imageBuffer.length >
            MAX_UPLOAD_SIZE
        ) {

            throw new Error(
                "Set cover exceeds the 20 MB upload limit."
            );

        }


        if (
            !isPNG(
                imageBuffer
            )
        ) {

            throw new Error(
                "Set cover must be a PNG image."
            );

        }


        const sets =
            loadSets();


        const set =
            sets.find(
                item =>
                    item.id === setID
            );


        if (
            !set
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }


        const fileName =
            `${setID}-cover.png`;


        const filePath =
            path.join(
                cardsDirectory,
                fileName
            );


        fs.writeFileSync(
            filePath,
            imageBuffer
        );


        set.coverFile =
            fileName;


        set.updatedAt =
            new Date().toISOString();


        saveSets(
            sets
        );


        return {
            setId:
                setID,

            fileName,

            path:
                filePath
        };

    }


    /* ========================================================
       CREATE CARD
       ======================================================== */

    function createCard(
        data,
        context
    ) {

        requireManagerPermission(
            context
        );


        const cards =
            loadCards();


        const validated =
            validateCardData(
                data
            );


        const cardID =
            getNextCardID(
                cards,
                validated.setId
            );


        /*
         * Make sure the referenced set exists.
         */

        const sets =
            loadSets();


        const setExists =
            sets.some(
                set =>
                    set.id ===
                    validated.setId
            );


        if (
            !setExists
        ) {

            throw new Error(
                `Set ${validated.setId} does not exist.`
            );

        }


        const card = {

            id:
                cardID,

            ...validated,

            imageFile:
                `${cardID}.png`,

            createdAt:
                new Date().toISOString()

        };


        cards.push(
            card
        );


        saveCards(
            cards
        );


        return {
            ...card
        };

    }


    /* ========================================================
       UPDATE CARD
       ======================================================== */

    function updateCard(
        cardID,
        data,
        context
    ) {

        requireManagerPermission(
            context
        );


        const cards =
            loadCards();


        const card =
            cards.find(
                item =>
                    item.id === cardID
            );


        if (
            !card
        ) {

            throw new Error(
                `Card ${cardID} does not exist.`
            );

        }


        const merged = {

            ...card,

            ...data,

            /*
             * These properties are controlled by the manager
             * and cannot be changed through arbitrary data.
             */

            id:
                card.id,

            imageFile:
                card.imageFile,

            createdAt:
                card.createdAt

        };


        /*
         * A card's set can be changed, but the new set must
         * exist.
         */

        const validated =
            validateCardData(
                merged
            );


        const sets =
            loadSets();


        const setExists =
            sets.some(
                set =>
                    set.id ===
                    validated.setId
            );


        if (
            !setExists
        ) {

            throw new Error(
                `Set ${validated.setId} does not exist.`
            );

        }


        Object.assign(
            card,
            validated
        );


        card.updatedAt =
            new Date().toISOString();


        saveCards(
            cards
        );


        return {
            ...card
        };

    }


    /* ========================================================
       DELETE CARD
       ======================================================== */

    function deleteCard(
        cardID,
        context
    ) {

        requireManagerPermission(
            context
        );


        const cards =
            loadCards();


        const index =
            cards.findIndex(
                card =>
                    card.id === cardID
            );


        if (
            index === -1
        ) {

            throw new Error(
                `Card ${cardID} does not exist.`
            );

        }


        const [
            removed
        ] =
            cards.splice(
                index,
                1
            );


        saveCards(
            cards
        );


        const imagePath =
            path.join(
                cardsDirectory,
                `${cardID}.png`
            );


        if (
            fs.existsSync(
                imagePath
            )
        ) {

            fs.unlinkSync(
                imagePath
            );

        }


        return {
            ...removed
        };

    }


    /* ========================================================
       UPLOAD CARD IMAGE
       ======================================================== */

    function uploadCardImage(
        cardID,
        imageBuffer,
        context
    ) {

        requireManagerPermission(
            context
        );


        if (
            !Buffer.isBuffer(
                imageBuffer
            )
        ) {

            throw new Error(
                "Card image must be a Buffer."
            );

        }


        if (
            imageBuffer.length >
            MAX_UPLOAD_SIZE
        ) {

            throw new Error(
                "Card image exceeds the 20 MB upload limit."
            );

        }


        if (
            !isPNG(
                imageBuffer
            )
        ) {

            throw new Error(
                "Card image must be a PNG image."
            );

        }


        const cards =
            loadCards();


        const card =
            cards.find(
                item =>
                    item.id === cardID
            );


        if (
            !card
        ) {

            throw new Error(
                `Card ${cardID} does not exist.`
            );

        }


        const fileName =
            `${cardID}.png`;


        const filePath =
            path.join(
                cardsDirectory,
                fileName
            );


        fs.writeFileSync(
            filePath,
            imageBuffer
        );


        card.imageFile =
            fileName;


        card.updatedAt =
            new Date().toISOString();


        saveCards(
            cards
        );


        return {

            cardId:
                cardID,

            fileName,

            path:
                filePath

        };

    }


    /* ========================================================
       BATCH CARD CREATION
       ======================================================== */

    function createCardsBatch(
        entries,
        context
    ) {

        requireManagerPermission(
            context
        );


        if (
            !Array.isArray(
                entries
            )
        ) {

            throw new Error(
                "Batch card data must be an array."
            );

        }


        if (
            entries.length === 0
        ) {

            throw new Error(
                "Batch upload cannot be empty."
            );

        }


        if (
            entries.length > 100
        ) {

            throw new Error(
                "A batch cannot contain more than 100 cards."
            );

        }


        const created =
            [];


        /*
         * Create cards one at a time so IDs remain sequential.
         */

        for (
            const entry
            of entries
        ) {

            created.push(
                createCard(
                    entry,
                    context
                )
            );

        }


        return created;

    }


    /* ========================================================
       BATCH CARD IMAGE UPLOAD
       ======================================================== */

    function uploadCardsBatch(
        entries,
        context
    ) {

        requireManagerPermission(
            context
        );


        if (
            !Array.isArray(
                entries
            )
        ) {

            throw new Error(
                "Batch image data must be an array."
            );

        }


        if (
            entries.length === 0
        ) {

            throw new Error(
                "Batch image upload cannot be empty."
            );

        }


        if (
            entries.length > 100
        ) {

            throw new Error(
                "A batch cannot contain more than 100 card images."
            );

        }


        const uploaded =
            [];


        for (
            const entry
            of entries
        ) {

            if (
                !entry ||
                typeof entry.cardID !== "string"
            ) {

                throw new Error(
                    "Every batch image entry requires a cardID."
                );

            }


            uploaded.push(
                uploadCardImage(
                    entry.cardID,
                    entry.imageBuffer,
                    context
                )
            );

        }


        return uploaded;

    }


    /* ========================================================
       GET ALL SETS
       ======================================================== */

    function getAllSets(
        context
    ) {

        requireManagerPermission(
            context
        );


        return loadSets()
            .map(
                set =>
                    ({
                        ...set
                    })
            );

    }


    /* ========================================================
       GET ALL CARDS
       ======================================================== */

    function getAllCards(
        context
    ) {

        requireManagerPermission(
            context
        );


        return loadCards()
            .map(
                card =>
                    ({
                        ...card
                    })
            );

    }


    /* ========================================================
       GET SET
       ======================================================== */

    function getSet(
        setID,
        context
    ) {

        requireManagerPermission(
            context
        );


        validateSetID(
            setID
        );


        const set =
            loadSets()
                .find(
                    item =>
                        item.id === setID
                );


        if (
            !set
        ) {

            return null;

        }


        return {
            ...set
        };

    }


    /* ========================================================
       GET CARD
       ======================================================== */

    function getCard(
        cardID,
        context
    ) {

        requireManagerPermission(
            context
        );


        const card =
            loadCards()
                .find(
                    item =>
                        item.id === cardID
                );


        if (
            !card
        ) {

            return null;

        }


        return {
            ...card
        };

    }


    /* ========================================================
       GET CARDS FOR SET
       ======================================================== */

    function getCardsForSet(
        setID,
        context
    ) {

        requireManagerPermission(
            context
        );


        validateSetID(
            setID
        );


        return loadCards()
            .filter(
                card =>
                    card.setId === setID
            )
            .map(
                card =>
                    ({
                        ...card
                    })
            );

    }


    /* ========================================================
       PUBLIC RELEASE CHECK
       ======================================================== */

    function isSetReleased(
        set
    ) {

        /*
         * The actual Pacific-time comparison is kept behind
         * this function so the release implementation can be
         * upgraded without changing the rest of the manager.
         */

        if (
            !set ||
            !set.releaseDate ||
            !set.releaseTime
        ) {

            return false;

        }


        const release =
            getReleaseDateTime(
                set
            );


        /*
         * Convert the Pacific date/time to a comparable
         * timestamp using Intl.DateTimeFormat.
         *
         * This handles daylight-saving changes for Vancouver.
         */

        const releaseString =
            `${String(release.month).padStart(2, "0")}/` +
            `${String(release.day).padStart(2, "0")}/` +
            `${release.year} ` +
            `${String(release.hour).padStart(2, "0")}:` +
            `${String(release.minute).padStart(2, "0")}:00`;


        /*
         * Use the timezone-aware formatter to determine the
         * current Pacific date/time components.
         */

        const formatter =
            new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                        DEFAULT_TIME_ZONE,

                    year:
                        "numeric",

                    month:
                        "2-digit",

                    day:
                        "2-digit",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    second:
                        "2-digit",

                    hourCycle:
                        "h23"

                }
            );


        const parts =
            formatter
                .formatToParts(
                    new Date()
                );


        const values =
            {};


        for (
            const part
            of parts
        ) {

            if (
                part.type !== "literal"
            ) {

                values[
                    part.type
                ] =
                    Number(
                        part.value
                    );

            }

        }


        const currentComparable =
            Date.UTC(
                values.year,
                values.month - 1,
                values.day,
                values.hour,
                values.minute,
                values.second
            );


        const releaseComparable =
            Date.UTC(
                release.year,
                release.month - 1,
                release.day,
                release.hour,
                release.minute,
                0
            );


        /*
         * releaseString is constructed above for clarity and
         * debugging consistency.
         */

        void releaseString;


        return (
            currentComparable >=
            releaseComparable
        );

    }


    /* ========================================================
       PUBLIC RELEASED SETS
       ======================================================== */

    function getPublicSets() {

        return loadSets()
            .filter(
                set =>
                    isSetReleased(
                        set
                    )
            )
            .map(
                set =>
                    ({
                        id:
                            set.id,

                        displayName:
                            set.displayName,

                        releaseDate:
                            set.releaseDate,

                        releaseTime:
                            set.releaseTime,

                        timeZone:
                            set.timeZone,

                        coverFile:
                            set.coverFile

                    })
            );

    }


    /* ========================================================
       PUBLIC RELEASED CARDS
       ======================================================== */

    function getPublicCards() {

        const sets =
            loadSets();


        const releasedSetIDs =
            new Set(
                sets
                    .filter(
                        set =>
                            isSetReleased(
                                set
                            )
                    )
                    .map(
                        set =>
                            set.id
                    )
            );


        return loadCards()
            .filter(
                card =>
                    releasedSetIDs.has(
                        card.setId
                    )
            )
            .map(
                card =>
                    ({
                        id:
                            card.id,

                        name:
                            card.name,

                        setId:
                            card.setId,

                        rarity:
                            card.rarity,

                        power:
                            card.power,

                        hp:
                            card.hp,

                        abilities:
                            card.abilities,

                        cardLimit:
                            card.cardLimit,

                        isSpecialEventCard:
                            card.isSpecialEventCard,

                        imageFile:
                            card.imageFile

                    })
            );

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        createSet,

        updateSet,

        deleteSet,

        uploadSetCover,

        createCard,

        updateCard,

        deleteCard,

        uploadCardImage,

        createCardsBatch,

        uploadCardsBatch,

        getAllSets,

        getAllCards,

        getSet,

        getCard,

        getCardsForSet,

        getPublicSets,

        getPublicCards,

        isSetReleased,

        validateCardData,

        validateAbilities,

        validateRequiredResources,

        getTimeZone,

        getNextSetID,

        getNextCardID,

        constants: {

            DEFAULT_TIME_ZONE,

            MAX_UPLOAD_SIZE,

            VALID_RARITIES

        }

    };

}


/* ============================================================
   MODULE EXPORT
   ============================================================ */

module.exports = {

    createSetManager

};
