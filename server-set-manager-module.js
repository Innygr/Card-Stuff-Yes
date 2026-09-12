```javascript
/* ================================================================
   CARD STUFF YES
   SERVER SET MANAGER MODULE

   File:
       server-set-manager-module.js

   Purpose:
       Server-side management for card sets and cards.

   Features:
       - Create sets
       - Edit sets
       - Delete sets
       - Upload set covers
       - Upload individual cards
       - Batch-upload cards
       - Automatically assign card IDs
       - Store set metadata in sets.json
       - Store card metadata in cards.json
       - Validate uploads and metadata
       - Owner/Mod-only administration
       - Hide unreleased content from public APIs
       - Schedule releases using Pacific Time

   STORAGE:

       cards/
       ├── S01-01.png
       ├── S01-02.png
       ├── S01-cover.png
       ├── S02-01.png
       └── ...

   IMPORTANT:
       Sets are NOT stored in folders.

       Cards are NOT stored inside assets/.

       Set IDs:
           S01
           S02
           S03

       Card IDs:
           S01-01
           S01-02
           S02-01

       Cover files:
           S01-cover.png
           S02-cover.png

   Release date format:
       MM-DD-YYYY

   Release time:
       HH:MM

   Time zone:
       America/Vancouver

   ================================================================ */

"use strict";

const fs = require("fs");
const path = require("path");


/* ================================================================
   CONFIGURATION
   ================================================================ */

const DEFAULT_TIME_ZONE = "America/Vancouver";

const DEFAULT_RARITIES = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary"
];

const MAX_SET_NAME_LENGTH = 128;
const MAX_CARD_NAME_LENGTH = 128;
const MAX_POWER = 999999;
const MAX_CARD_LIMIT = 999;

/*
 * PNG files begin with this signature.
 */
const PNG_SIGNATURE = Buffer.from([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A
]);


/* ================================================================
   CREATE SET MANAGER
   ================================================================ */

function createSetManager(options = {}) {

    /*
     * server.js supplies these values when loading the module.
     */

    const WEBSITE_DIRECTORY =
        options.websiteDirectory ||
        __dirname;

    const CARDS_DIRECTORY =
        options.cardsDirectory ||
        path.resolve(
            WEBSITE_DIRECTORY,
            "cards"
        );

    const SETS_FILE =
        options.setsFile ||
        path.resolve(
            WEBSITE_DIRECTORY,
            "sets.json"
        );

    const CARDS_FILE =
        options.cardsFile ||
        path.resolve(
            WEBSITE_DIRECTORY,
            "cards.json"
        );

    const TIME_ZONE =
        options.timeZone ||
        DEFAULT_TIME_ZONE;

    const getPlayerFromSession =
        options.getPlayerFromSession;

    const sendJSON =
        options.sendJSON;

    const sendText =
        options.sendText;


    /* ============================================================
       FILE INITIALIZATION
       ============================================================ */

    function ensureDirectory(directory) {

        if (
            !fs.existsSync(directory)
        ) {

            fs.mkdirSync(
                directory,
                {
                    recursive: true
                }
            );

        }

    }


    function ensureFile(
        filePath,
        defaultValue
    ) {

        if (
            !fs.existsSync(filePath)
        ) {

            writeJSON(
                filePath,
                defaultValue
            );

        }

    }


    function initialize() {

        ensureDirectory(
            CARDS_DIRECTORY
        );

        ensureFile(
            SETS_FILE,
            []
        );

        ensureFile(
            CARDS_FILE,
            []
        );

    }


    /* ============================================================
       JSON FILE HELPERS
       ============================================================ */

    function readJSON(
        filePath,
        fallback
    ) {

        if (
            !fs.existsSync(filePath)
        ) {

            return fallback;

        }

        const contents =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        if (
            !contents.trim()
        ) {

            return fallback;

        }

        try {

            return JSON.parse(
                contents
            );

        } catch (error) {

            throw new Error(
                `Could not parse ${path.basename(filePath)}: ${error.message}`
            );

        }

    }


    function writeJSON(
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
            ) + "\n",
            "utf8"
        );

        fs.renameSync(
            temporaryPath,
            filePath
        );

    }


    function getSets() {

        const sets =
            readJSON(
                SETS_FILE,
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


    function getCards() {

        const cards =
            readJSON(
                CARDS_FILE,
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


    /* ============================================================
       BASIC VALIDATION HELPERS
       ============================================================ */

    function cleanString(
        value,
        maxLength
    ) {

        if (
            typeof value !== "string"
        ) {

            return null;

        }

        const cleaned =
            value.trim();

        if (
            !cleaned ||
            cleaned.length > maxLength
        ) {

            return null;

        }

        return cleaned;

    }


    function isValidSetID(
        setID
    ) {

        return (
            typeof setID === "string" &&
            /^S\d{2}$/.test(setID)
        );

    }


    function isValidCardID(
        cardID
    ) {

        return (
            typeof cardID === "string" &&
            /^S\d{2}-\d{2,}$/.test(cardID)
        );

    }


    /* ============================================================
       RELEASE DATE VALIDATION

       Format:

           MM-DD-YYYY

       Example:

           10-01-2026
       ============================================================ */

    function parseReleaseDate(
        value
    ) {

        if (
            typeof value !== "string" ||
            !/^\d{2}-\d{2}-\d{4}$/.test(value)
        ) {

            return null;

        }

        const parts =
            value.split("-");

        const month =
            Number(parts[0]);

        const day =
            Number(parts[1]);

        const year =
            Number(parts[2]);

        if (
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31 ||
            year < 1970 ||
            year > 9999
        ) {

            return null;

        }

        /*
         * Verify that the day actually exists in that month.
         */

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

            return null;

        }

        return {
            month,
            day,
            year
        };

    }


    /* ============================================================
       RELEASE TIME VALIDATION
       ============================================================ */

    function isValidReleaseTime(
        value
    ) {

        if (
            typeof value !== "string"
        ) {

            return false;

        }

        if (
            !/^\d{2}:\d{2}$/.test(value)
        ) {

            return false;

        }

        const hour =
            Number(
                value.slice(0, 2)
            );

        const minute =
            Number(
                value.slice(3, 5)
            );

        return (
            hour >= 0 &&
            hour <= 23 &&
            minute >= 0 &&
            minute <= 59
        );

    }


    /* ============================================================
       PACIFIC TIME CONVERSION

       The server determines the real UTC release moment from the
       configured Pacific Time date/time.

       America/Vancouver is used so daylight-saving changes are
       handled automatically.
       ============================================================ */

    function getTimeZoneParts(
        date
    ) {

        const parts =
            new Intl.DateTimeFormat(
                "en-US",
                {
                    timeZone: TIME_ZONE,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hourCycle: "h23"
                }
            ).formatToParts(
                date
            );

        const result = {};

        for (
            const part of parts
        ) {

            if (
                part.type !== "literal"
            ) {

                result[part.type] =
                    Number(part.value);

            }

        }

        return result;

    }


    function getTimeZoneOffset(
        date
    ) {

        const parts =
            getTimeZoneParts(
                date
            );

        const asUTC =
            Date.UTC(
                parts.year,
                parts.month - 1,
                parts.day,
                parts.hour,
                parts.minute,
                parts.second
            );

        return (
            asUTC -
            date.getTime()
        );

    }


    function pacificDateToUTC(
        year,
        month,
        day,
        hour,
        minute
    ) {

        const assumedUTC =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day,
                    hour,
                    minute,
                    0
                )
            );

        const offset =
            getTimeZoneOffset(
                assumedUTC
            );

        return new Date(
            assumedUTC.getTime() -
            offset
        );

    }


    function getSetReleaseDate(
        set
    ) {

        const parsed =
            parseReleaseDate(
                set.releaseDate
            );

        if (!parsed) {

            return null;

        }

        const releaseTime =
            isValidReleaseTime(
                set.releaseTime
            )
                ? set.releaseTime
                : "00:00";

        const hour =
            Number(
                releaseTime.slice(0, 2)
            );

        const minute =
            Number(
                releaseTime.slice(3, 5)
            );

        return pacificDateToUTC(
            parsed.year,
            parsed.month,
            parsed.day,
            hour,
            minute
        );

    }


    function isSetReleased(
        set
    ) {

        const releaseDate =
            getSetReleaseDate(
                set
            );

        if (!releaseDate) {

            return false;

        }

        return (
            Date.now() >=
            releaseDate.getTime()
        );

    }


    /* ============================================================
       ID GENERATION
       ============================================================ */

    function getNextSetID(
        sets
    ) {

        let highest =
            0;

        for (
            const set of sets
        ) {

            if (
                !isValidSetID(
                    set.id
                )
            ) {

                continue;

            }

            const number =
                Number(
                    set.id.slice(1)
                );

            if (
                number > highest
            ) {

                highest = number;

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


    function getHighestCardNumber(
        setID,
        cards
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
                !card.id.startsWith(
                    prefix
                )
            ) {

                continue;

            }

            const number =
                Number(
                    card.id.slice(
                        prefix.length
                    )
                );

            if (
                Number.isInteger(number) &&
                number > highest
            ) {

                highest = number;

            }

        }

        return highest;

    }


    function getNextCardID(
        setID,
        cards
    ) {

        const highest =
            getHighestCardNumber(
                setID,
                cards
            );

        return (
            `${setID}-${String(
                highest + 1
            ).padStart(
                2,
                "0"
            )}`
        );

    }


    function getNextCardIDs(
        setID,
        cards,
        amount
    ) {

        const highest =
            getHighestCardNumber(
                setID,
                cards
            );

        const result = [];

        for (
            let index = 1;
            index <= amount;
            index++
        ) {

            result.push(
                `${setID}-${String(
                    highest + index
                ).padStart(
                    2,
                    "0"
                )}`
            );

        }

        return result;

    }


    /* ============================================================
       CARD FIELD VALIDATION
       ============================================================ */

    function validateRarity(
        value
    ) {

        const rarity =
            cleanString(
                value,
                32
            );

        if (!rarity) {

            throw new Error(
                "Card rarity is required."
            );

        }

        const normalized =
            rarity.toLowerCase();

        if (
            !DEFAULT_RARITIES.includes(
                normalized
            )
        ) {

            throw new Error(
                `Invalid card rarity. Allowed rarities: ${DEFAULT_RARITIES.join(", ")}`
            );

        }

        return normalized;

    }


    function validatePower(
        value
    ) {

        const power =
            Number(value);

        if (
            !Number.isFinite(power) ||
            power < 0 ||
            power > MAX_POWER
        ) {

            throw new Error(
                `Card power must be between 0 and ${MAX_POWER}.`
            );

        }

        return power;

    }


    function validateCardLimit(
        value
    ) {

        const limit =
            Number(value);

        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > MAX_CARD_LIMIT
        ) {

            throw new Error(
                `Card limit must be a whole number between 1 and ${MAX_CARD_LIMIT}.`
            );

        }

        return limit;

    }


    function validateSpecialEventCard(
        value
    ) {

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {

            return false;

        }

        if (
            value === true ||
            value === "true"
        ) {

            return true;

        }

        if (
            value === false ||
            value === "false"
        ) {

            return false;

        }

        throw new Error(
            "isSpecialEventCard must be true or false."
        );

    }


    function parseCardStats(
        value
    ) {

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {

            return {};

        }

        if (
            typeof value === "object" &&
            !Array.isArray(value)
        ) {

            return value;

        }

        if (
            typeof value !== "string"
        ) {

            throw new Error(
                "Card stats must be an object or JSON object."
            );

        }

        let parsed;

        try {

            parsed =
                JSON.parse(
                    value
                );

        } catch {

            throw new Error(
                "Card stats contains invalid JSON."
            );

        }

        if (
            typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)
        ) {

            throw new Error(
                "Card stats must be a JSON object."
            );

        }

        return parsed;

    }


    /* ============================================================
       SET VALIDATION
       ============================================================ */

    function validateSetInput(
        input,
        existingSet = null
    ) {

        const setID =
            cleanString(
                input.id ??
                existingSet?.id,
                3
            );

        if (
            !isValidSetID(
                setID
            )
        ) {

            throw new Error(
                "Set ID must use the format S01, S02, S03, etc."
            );

        }

        const displayName =
            cleanString(
                input.displayName ??
                existingSet?.displayName,
                MAX_SET_NAME_LENGTH
            );

        if (!displayName) {

            throw new Error(
                "Set display name is required."
            );

        }

        const releaseDate =
            cleanString(
                input.releaseDate ??
                existingSet?.releaseDate,
                10
            );

        if (
            !parseReleaseDate(
                releaseDate
            )
        ) {

            throw new Error(
                "Release date must use MM-DD-YYYY format."
            );

        }

        const releaseTime =
            input.releaseTime ??
            existingSet?.releaseTime ??
            "00:00";

        if (
            !isValidReleaseTime(
                releaseTime
            )
        ) {

            throw new Error(
                "Release time must use HH:MM format."
            );

        }

        return {
            id: setID,
            displayName,
            releaseDate,
            releaseTime,
            timeZone: TIME_ZONE,
            coverFile:
                existingSet?.coverFile ||
                `${setID}-cover.png`
        };

    }


    /* ============================================================
       CARD VALIDATION
       ============================================================ */

    function validateCardInput(
        input
    ) {

        const name =
            cleanString(
                input.name ??
                input.cardName,
                MAX_CARD_NAME_LENGTH
            );

        if (!name) {

            throw new Error(
                "Card name is required."
            );

        }

        const setID =
            cleanString(
                input.setId ??
                input.setID ??
                input.set,
                3
            );

        if (
            !isValidSetID(
                setID
            )
        ) {

            throw new Error(
                "A valid set ID is required."
            );

        }

        const rarity =
            validateRarity(
                input.rarity
            );

        const power =
            validatePower(
                input.power
            );

        const cardLimit =
            validateCardLimit(
                input.cardLimit
            );

        const isSpecialEventCard =
            validateSpecialEventCard(
                input.isSpecialEventCard ??
                input.isEventSpecialCard
            );

        const stats =
            parseCardStats(
                input.stats ??
                input.cardStats
            );

        return {
            name,
            setId: setID,
            rarity,
            power,
            isSpecialEventCard,
            cardLimit,
            stats
        };

    }


    /* ============================================================
       CREATE SET
       ============================================================ */

    function createSet(
        input
    ) {

        if (
            !input ||
            typeof input !== "object"
        ) {

            throw new Error(
                "Set data is required."
            );

        }

        const sets =
            getSets();

        let setID =
            input.id;

        /*
         * If the Set Manager does not supply an ID,
         * automatically create the next one.
         */

        if (
            !setID
        ) {

            setID =
                getNextSetID(
                    sets
                );

        }

        const validated =
            validateSetInput(
                {
                    ...input,
                    id: setID
                }
            );

        if (
            sets.some(
                set =>
                    set.id ===
                    validated.id
            )
        ) {

            throw new Error(
                `Set ${validated.id} already exists.`
            );

        }

        const now =
            new Date().toISOString();

        const record = {
            id:
                validated.id,

            displayName:
                validated.displayName,

            releaseDate:
                validated.releaseDate,

            releaseTime:
                validated.releaseTime,

            timeZone:
                TIME_ZONE,

            coverFile:
                validated.coverFile,

            createdAt:
                now,

            updatedAt:
                now
        };

        sets.push(
            record
        );

        writeJSON(
            SETS_FILE,
            sets
        );

        return record;

    }


    /* ============================================================
       UPDATE SET
       ============================================================ */

    function updateSet(
        setID,
        input
    ) {

        const sets =
            getSets();

        const index =
            sets.findIndex(
                set =>
                    set.id ===
                    setID
            );

        if (
            index === -1
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }

        const validated =
            validateSetInput(
                {
                    ...input,
                    id: setID
                },
                sets[index]
            );

        const updated = {
            ...sets[index],
            ...validated,
            updatedAt:
                new Date().toISOString()
        };

        sets[index] =
            updated;

        writeJSON(
            SETS_FILE,
            sets
        );

        return updated;

    }


    /* ============================================================
       DELETE SET
       ============================================================ */

    function deleteSet(
        setID
    ) {

        const sets =
            getSets();

        const cards =
            getCards();

        const index =
            sets.findIndex(
                set =>
                    set.id ===
                    setID
            );

        if (
            index === -1
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }

        /*
         * A set cannot be deleted while it still has cards.
         */

        const cardsInSet =
            cards.filter(
                card =>
                    card.setId ===
                    setID
            );

        if (
            cardsInSet.length > 0
        ) {

            throw new Error(
                `Cannot delete ${setID} because ${cardsInSet.length} card(s) still belong to it.`
            );

        }

        const removed =
            sets.splice(
                index,
                1
            )[0];

        writeJSON(
            SETS_FILE,
            sets
        );

        /*
         * Delete the cover image if one exists.
         */

        const coverPath =
            path.resolve(
                CARDS_DIRECTORY,
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

        return removed;

    }


    /* ============================================================
       SAVE CARD RECORD
       ============================================================ */

    function addCardRecord(
        record
    ) {

        const cards =
            getCards();

        if (
            cards.some(
                card =>
                    card.id ===
                    record.id
            )
        ) {

            throw new Error(
                `Card ${record.id} already exists.`
            );

        }

        cards.push(
            record
        );

        writeJSON(
            CARDS_FILE,
            cards
        );

        return record;

    }


    /* ============================================================
       SAVE PNG
       ============================================================ */

    function savePNG(
        filename,
        imageBuffer
    ) {

        if (
            !isPNG(
                imageBuffer
            )
        ) {

            throw new Error(
                "Uploaded file is not a valid PNG."
            );

        }

        /*
         * Only plain filenames are accepted.
         *
         * This prevents path traversal.
         */

        if (
            path.basename(
                filename
            ) !== filename
        ) {

            throw new Error(
                "Invalid upload filename."
            );

        }

        const destination =
            path.resolve(
                CARDS_DIRECTORY,
                filename
            );

        const root =
            path.resolve(
                CARDS_DIRECTORY
            );

        if (
            !destination.startsWith(
                root +
                path.sep
            )
        ) {

            throw new Error(
                "Invalid upload destination."
            );

        }

        fs.writeFileSync(
            destination,
            imageBuffer
        );

        return destination;

    }


    function isPNG(
        buffer
    ) {

        if (
            !Buffer.isBuffer(buffer)
        ) {

            return false;

        }

        if (
            buffer.length <
            PNG_SIGNATURE.length
        ) {

            return false;

        }

        return buffer
            .subarray(
                0,
                PNG_SIGNATURE.length
            )
            .equals(
                PNG_SIGNATURE
            );

    }


    /* ============================================================
       UPLOAD INDIVIDUAL CARD
       ============================================================ */

    function uploadCard(
        metadata,
        imageBuffer
    ) {

        const cards =
            getCards();

        const sets =
            getSets();

        const validated =
            validateCardInput(
                metadata
            );

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

        const cardID =
            getNextCardID(
                validated.setId,
                cards
            );

        const filename =
            `${cardID}.png`;

        savePNG(
            filename,
            imageBuffer
        );

        const now =
            new Date().toISOString();

        const record = {
            id:
                cardID,

            name:
                validated.name,

            setId:
                validated.setId,

            rarity:
                validated.rarity,

            power:
                validated.power,

            isSpecialEventCard:
                validated.isSpecialEventCard,

            cardLimit:
                validated.cardLimit,

            stats:
                validated.stats,

            image:
                filename,

            createdAt:
                now,

            updatedAt:
                now
        };

        try {

            addCardRecord(
                record
            );

        } catch (error) {

            const imagePath =
                path.resolve(
                    CARDS_DIRECTORY,
                    filename
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

            throw error;

        }

        return record;

    }


    /* ============================================================
       BATCH CARD UPLOAD
       ============================================================ */

    function uploadCardsBatch(
        setID,
        uploads
    ) {

        if (
            !isValidSetID(
                setID
            )
        ) {

            throw new Error(
                "Invalid set ID."
            );

        }

        if (
            !Array.isArray(
                uploads
            ) ||
            uploads.length === 0
        ) {

            throw new Error(
                "No cards were supplied."
            );

        }

        const sets =
            getSets();

        const cards =
            getCards();

        const setExists =
            sets.some(
                set =>
                    set.id ===
                    setID
            );

        if (
            !setExists
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }

        const IDs =
            getNextCardIDs(
                setID,
                cards,
                uploads.length
            );

        const records = [];

        const writtenFiles = [];

        try {

            for (
                let index = 0;
                index < uploads.length;
                index++
            ) {

                const upload =
                    uploads[index];

                if (
                    !upload ||
                    !Buffer.isBuffer(
                        upload.image
                    )
                ) {

                    throw new Error(
                        `Card ${index + 1} has no image.`
                    );

                }

                const metadata =
                    validateCardInput(
                        {
                            ...(upload.metadata || {}),
                            setId: setID
                        }
                    );

                const cardID =
                    IDs[index];

                const filename =
                    `${cardID}.png`;

                savePNG(
                    filename,
                    upload.image
                );

                writtenFiles.push(
                    filename
                );

                const now =
                    new Date().toISOString();

                records.push({
                    id:
                        cardID,

                    name:
                        metadata.name,

                    setId:
                        setID,

                    rarity:
                        metadata.rarity,

                    power:
                        metadata.power,

                    isSpecialEventCard:
                        metadata.isSpecialEventCard,

                    cardLimit:
                        metadata.cardLimit,

                    stats:
                        metadata.stats,

                    image:
                        filename,

                    createdAt:
                        now,

                    updatedAt:
                        now
                });

            }

            /*
             * Write cards.json only after every card has passed
             * validation and every image has been written.
             */

            writeJSON(
                CARDS_FILE,
                cards.concat(
                    records
                )
            );

            return records;

        } catch (error) {

            /*
             * Remove files already written if the batch fails.
             */

            for (
                const filename of
                writtenFiles
            ) {

                const imagePath =
                    path.resolve(
                        CARDS_DIRECTORY,
                        filename
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

            }

            throw error;

        }

    }


    /* ============================================================
       UPLOAD SET COVER
       ============================================================ */

    function uploadSetCover(
        setID,
        imageBuffer
    ) {

        const sets =
            getSets();

        const index =
            sets.findIndex(
                set =>
                    set.id ===
                    setID
            );

        if (
            index === -1
        ) {

            throw new Error(
                `Set ${setID} does not exist.`
            );

        }

        if (
            !isPNG(
                imageBuffer
            )
        ) {

            throw new Error(
                "Set cover must be a PNG."
            );

        }

        const filename =
            `${setID}-cover.png`;

        savePNG(
            filename,
            imageBuffer
        );

        sets[index].coverFile =
            filename;

        sets[index].updatedAt =
            new Date().toISOString();

        writeJSON(
            SETS_FILE,
            sets
        );

        return sets[index];

    }


    /* ============================================================
       PUBLIC SET DATA
       ============================================================ */

    function getPublicSets() {

        return getSets()
            .filter(
                set =>
                    isSetReleased(
                        set
                    )
            )
            .map(
                set => ({
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


    /* ============================================================
       PUBLIC CARD DATA
       ============================================================ */

    function getPublicCards() {

        const releasedSetIDs =
            new Set(
                getSets()
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

        return getCards()
            .filter(
                card =>
                    releasedSetIDs.has(
                        card.setId
                    )
            )
            .map(
                card => ({
                    ...card
                })
            );

    }


    /* ============================================================
       ADMIN DATA
       ============================================================ */

    function getAdminSets() {

        return getSets()
            .map(
                set => ({
                    ...set,

                    released:
                        isSetReleased(
                            set
                        )
                })
            );

    }


    function getAdminCards() {

        return getCards()
            .map(
                card => ({
                    ...card
                })
            );

    }


    /* ============================================================
       PERMISSION CHECKING
       ============================================================ */

    function getCurrentPlayer(
        req
    ) {

        if (
            typeof getPlayerFromSession !==
            "function"
        ) {

            return null;

        }

        return getPlayerFromSession(
            req
        );

    }


    function hasSetManagerPermission(
        req
    ) {

        const player =
            getCurrentPlayer(
                req
            );

        if (!player) {

            return false;

        }

        return (
            player.rank === "Owner" ||
            player.rank === "Mod" ||
            player.rank === "Moderator"
        );

    }


    function requirePermission(
        req,
        res
    ) {

        if (
            hasSetManagerPermission(
                req
            )
        ) {

            return true;

        }

        if (
            typeof sendJSON ===
            "function"
        ) {

            sendJSON(
                res,
                403,
                {
                    error:
                        "Set Manager access denied."
                }
            );

        } else {

            res.statusCode = 403;

            res.end(
                "Set Manager access denied."
            );

        }

        return false;

    }


    /* ============================================================
       REQUEST BODY HELPERS
       ============================================================ */

    function readRequestBody(
        req
    ) {

        return new Promise(
            (resolve, reject) => {

                let body = "";

                req.on(
                    "data",
                    chunk => {

                        body +=
                            chunk.toString(
                                "utf8"
                            );

                        if (
                            body.length >
                            1024 * 1024
                        ) {

                            reject(
                                new Error(
                                    "Request body is too large."
                                )
                            );

                            req.destroy();

                        }

                    }
                );

                req.on(
                    "end",
                    () => {

                        if (
                            !body.trim()
                        ) {

                            resolve({});

                            return;

                        }

                        try {

                            resolve(
                                JSON.parse(
                                    body
                                )
                            );

                        } catch {

                            reject(
                                new Error(
                                    "Invalid JSON body."
                                )
                            );

                        }

                    }
                );

                req.on(
                    "error",
                    reject
                );

            }
        );

    }


    /* ============================================================
       MULTIPART UPLOAD PARSER
       ============================================================ */

    function parseMultipartBody(
        req,
        bodyBuffer
    ) {

        const contentType =
            req.headers[
                "content-type"
            ] || "";

        const boundaryMatch =
            contentType.match(
                /boundary=(?:"([^"]+)"|([^;]+))/i
            );

        if (
            !boundaryMatch
        ) {

            throw new Error(
                "Multipart boundary was not provided."
            );

        }

        const boundary =
            Buffer.from(
                `--${
                    boundaryMatch[1] ||
                    boundaryMatch[2]
                }`
            );

        const parts = [];

        let position = 0;

        while (true) {

            const start =
                bodyBuffer.indexOf(
                    boundary,
                    position
                );

            if (
                start === -1
            ) {

                break;

            }

            const next =
                bodyBuffer.indexOf(
                    boundary,
                    start + boundary.length
                );

            if (
                next === -1
            ) {

                break;

            }

            let part =
                bodyBuffer.slice(
                    start + boundary.length,
                    next
                );

            position =
                next;

            if (
                part.subarray(
                    0,
                    2
                ).equals(
                    Buffer.from(
                        "\r\n"
                    )
                )
            ) {

                part =
                    part.subarray(
                        2
                    );

            }

            if (
                part.subarray(
                    -2
                ).equals(
                    Buffer.from(
                        "\r\n"
                    )
                )
            ) {

                part =
                    part.subarray(
                        0,
                        part.length - 2
                    );

            }

            if (
                part.length === 0
            ) {

                continue;

            }

            const separator =
                Buffer.from(
                    "\r\n\r\n"
                );

            const separatorIndex =
                part.indexOf(
                    separator
                );

            if (
                separatorIndex === -1
            ) {

                continue;

            }

            const headerText =
                part
                    .subarray(
                        0,
                        separatorIndex
                    )
                    .toString(
                        "utf8"
                    );

            const data =
                part.subarray(
                    separatorIndex +
                    separator.length
                );

            let fieldName =
                null;

            let filename =
                null;

            let partContentType =
                null;

            for (
                const header of
                headerText.split(
                    "\r\n"
                )
            ) {

                const colon =
                    header.indexOf(
                        ":"
                    );

                if (
                    colon === -1
                ) {

                    continue;

                }

                const headerName =
                    header
                        .slice(
                            0,
                            colon
                        )
                        .trim()
                        .toLowerCase();

                const headerValue =
                    header
                        .slice(
                            colon + 1
                        )
                        .trim();

                if (
                    headerName ===
                    "content-disposition"
                ) {

                    const nameMatch =
                        headerValue.match(
                            /name="([^"]+)"/i
                        );

                    if (
                        nameMatch
                    ) {

                        fieldName =
                            nameMatch[1];

                    }

                    const fileMatch =
                        headerValue.match(
                            /filename="([^"]*)"/i
                        );

                    if (
                        fileMatch
                    ) {

                        filename =
                            fileMatch[1];

                    }

                }

                if (
                    headerName ===
                    "content-type"
                ) {

                    partContentType =
                        headerValue;

                }

            }

            if (
                !fieldName
            ) {

                continue;

            }

            parts.push({
                fieldName,
                filename,
                contentType:
                    partContentType,
                data
            });

        }

        return parts;

    }


    function readMultipartRequest(
        req
    ) {

        return new Promise(
            (resolve, reject) => {

                const chunks = [];

                let totalSize = 0;

                req.on(
                    "data",
                    chunk => {

                        totalSize +=
                            chunk.length;

                        /*
                         * Maximum upload request:
                         * 20 MB.
                         */

                        if (
                            totalSize >
                            20 * 1024 * 1024
                        ) {

                            reject(
                                new Error(
                                    "Upload request is too large."
                                )
                            );

                            req.destroy();

                            return;

                        }

                        chunks.push(
                            chunk
                        );

                    }
                );

                req.on(
                    "end",
                    () => {

                        try {

                            const body =
                                Buffer.concat(
                                    chunks
                                );

                            resolve(
                                parseMultipartBody(
                                    req,
                                    body
                                )
                            );

                        } catch (error) {

                            reject(
                                error
                            );

                        }

                    }
                );

                req.on(
                    "error",
                    reject
                );

            }
        );

    }


    /* ============================================================
       PATH HELPERS
       ============================================================ */

    function decodePathPart(
        value
    ) {

        try {

            return decodeURIComponent(
                value
            );

        } catch {

            return value;

        }

    }


    function getPathParts(
        pathname
    ) {

        return pathname
            .split("/")
            .filter(
                Boolean
            )
            .map(
                decodePathPart
            );

    }


    /* ============================================================
       REQUEST HANDLER
       ============================================================ */

    async function handleRequest(
        req,
        res
    ) {

        const url =
            new URL(
                req.url,
                "http://localhost"
            );

        const pathname =
            url.pathname;

        const method =
            req.method ||
            "GET";

        const parts =
            getPathParts(
                pathname
            );


        /* ========================================================
           ADMIN - LIST SETS
           ======================================================== */

        if (
            method === "GET" &&
            pathname ===
            "/api/admin/sets"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                sendJSON(
                    res,
                    200,
                    {
                        sets:
                            getAdminSets()
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    500,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - LIST CARDS
           ======================================================== */

        if (
            method === "GET" &&
            pathname ===
            "/api/admin/cards"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                sendJSON(
                    res,
                    200,
                    {
                        cards:
                            getAdminCards()
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    500,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - CREATE SET
           ======================================================== */

        if (
            method === "POST" &&
            pathname ===
            "/api/admin/sets"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                const body =
                    await readRequestBody(
                        req
                    );

                const set =
                    createSet(
                        body
                    );

                sendJSON(
                    res,
                    201,
                    {
                        success:
                            true,
                        set
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - UPDATE SET
           ======================================================== */

        if (
            method === "PUT" &&
            parts.length === 4 &&
            parts[0] === "api" &&
            parts[1] === "admin" &&
            parts[2] === "sets"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            const setID =
                parts[3];

            if (
                !isValidSetID(
                    setID
                )
            ) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            "Invalid set ID."
                    }
                );

                return true;

            }

            try {

                const body =
                    await readRequestBody(
                        req
                    );

                const set =
                    updateSet(
                        setID,
                        body
                    );

                sendJSON(
                    res,
                    200,
                    {
                        success:
                            true,
                        set
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - DELETE SET
           ======================================================== */

        if (
            method === "DELETE" &&
            parts.length === 4 &&
            parts[0] === "api" &&
            parts[1] === "admin" &&
            parts[2] === "sets"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            const setID =
                parts[3];

            if (
                !isValidSetID(
                    setID
                )
            ) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            "Invalid set ID."
                    }
                );

                return true;

            }

            try {

                const removed =
                    deleteSet(
                        setID
                    );

                sendJSON(
                    res,
                    200,
                    {
                        success:
                            true,
                        set:
                            removed
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - UPLOAD CARD
           ======================================================== */

        if (
            method === "POST" &&
            pathname ===
            "/api/admin/cards/upload"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                const parts =
                    await readMultipartRequest(
                        req
                    );

                let metadata = {};

                let image =
                    null;

                for (
                    const part of
                    parts
                ) {

                    if (
                        part.fieldName ===
                        "metadata"
                    ) {

                        metadata =
                            JSON.parse(
                                part.data.toString(
                                    "utf8"
                                )
                            );

                    }

                    if (
                        part.fieldName ===
                        "card" ||
                        part.fieldName ===
                        "image"
                    ) {

                        image =
                            part.data;

                    }

                }

                if (
                    !image
                ) {

                    throw new Error(
                        "No card PNG was uploaded."
                    );

                }

                const card =
                    uploadCard(
                        metadata,
                        image
                    );

                sendJSON(
                    res,
                    201,
                    {
                        success:
                            true,
                        card
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - UPLOAD SET COVER
           ======================================================== */

        if (
            method === "POST" &&
            pathname ===
            "/api/admin/sets/cover"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                const parts =
                    await readMultipartRequest(
                        req
                    );

                let setID =
                    null;

                let image =
                    null;

                for (
                    const part of
                    parts
                ) {

                    if (
                        part.fieldName ===
                        "setId" ||
                        part.fieldName ===
                        "setID"
                    ) {

                        setID =
                            part.data
                                .toString(
                                    "utf8"
                                )
                                .trim();

                    }

                    if (
                        part.fieldName ===
                        "cover" ||
                        part.fieldName ===
                        "image"
                    ) {

                        image =
                            part.data;

                    }

                }

                if (
                    !isValidSetID(
                        setID
                    )
                ) {

                    throw new Error(
                        "A valid set ID is required."
                    );

                }

                if (
                    !image
                ) {

                    throw new Error(
                        "No cover PNG was uploaded."
                    );

                }

                const set =
                    uploadSetCover(
                        setID,
                        image
                    );

                sendJSON(
                    res,
                    200,
                    {
                        success:
                            true,
                        set
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           ADMIN - BATCH UPLOAD CARDS
           ======================================================== */

        if (
            method === "POST" &&
            pathname ===
            "/api/admin/cards/batch-upload"
        ) {

            if (
                !requirePermission(
                    req,
                    res
                )
            ) {

                return true;

            }

            try {

                const parts =
                    await readMultipartRequest(
                        req
                    );

                let setID =
                    null;

                let metadataList =
                    [];

                const images = [];

                for (
                    const part of
                    parts
                ) {

                    if (
                        part.fieldName ===
                        "setId" ||
                        part.fieldName ===
                        "setID"
                    ) {

                        setID =
                            part.data
                                .toString(
                                    "utf8"
                                )
                                .trim();

                        continue;

                    }

                    if (
                        part.fieldName ===
                        "metadata"
                    ) {

                        const parsed =
                            JSON.parse(
                                part.data.toString(
                                    "utf8"
                                )
                            );

                        if (
                            !Array.isArray(
                                parsed
                            )
                        ) {

                            throw new Error(
                                "Batch metadata must be an array."
                            );

                        }

                        metadataList =
                            parsed;

                        continue;

                    }

                    if (
                        part.fieldName ===
                        "card" ||
                        part.fieldName ===
                        "image" ||
                        part.fieldName ===
                        "cards"
                    ) {

                        images.push(
                            part.data
                        );

                    }

                }

                if (
                    !isValidSetID(
                        setID
                    )
                ) {

                    throw new Error(
                        "A valid set ID is required."
                    );

                }

                if (
                    images.length === 0
                ) {

                    throw new Error(
                        "No card PNGs were uploaded."
                    );

                }

                if (
                    metadataList.length !==
                    images.length
                ) {

                    throw new Error(
                        "The number of metadata entries must match the number of card images."
                    );

                }

                const uploads =
                    images.map(
                        (
                            image,
                            index
                        ) => ({
                            image,
                            metadata:
                                metadataList[index]
                        })
                    );

                const cards =
                    uploadCardsBatch(
                        setID,
                        uploads
                    );

                sendJSON(
                    res,
                    201,
                    {
                        success:
                            true,
                        cards
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           PUBLIC - RELEASED SETS
           ======================================================== */

        if (
            method === "GET" &&
            pathname ===
            "/api/sets"
        ) {

            try {

                sendJSON(
                    res,
                    200,
                    {
                        sets:
                            getPublicSets()
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    500,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           PUBLIC - RELEASED CARDS
           ======================================================== */

        if (
            method === "GET" &&
            pathname ===
            "/api/cards"
        ) {

            try {

                sendJSON(
                    res,
                    200,
                    {
                        cards:
                            getPublicCards()
                    }
                );

            } catch (error) {

                sendJSON(
                    res,
                    500,
                    {
                        error:
                            error.message
                    }
                );

            }

            return true;

        }


        /* ========================================================
           NOT A SET MANAGER REQUEST

           server.js should continue handling this request.
           ======================================================== */

        return false;

    }


    /* ============================================================
       INITIALIZE
       ============================================================ */

    initialize();


    /* ============================================================
       PUBLIC MODULE API
       ============================================================ */

    return {

        initialize,

        handleRequest,

        getSets,

        getCards,

        getPublicSets,

        getPublicCards,

        getAdminSets,

        getAdminCards,

        createSet,

        updateSet,

        deleteSet,

        uploadCard,

        uploadCardsBatch,

        uploadSetCover,

        isSetReleased,

        getSetReleaseDate,

        getNextSetID,

        getNextCardID,

        getNextCardIDs,

        hasSetManagerPermission,

        paths: {

            websiteDirectory:
                WEBSITE_DIRECTORY,

            cardsDirectory:
                CARDS_DIRECTORY,

            setsFile:
                SETS_FILE,

            cardsFile:
                CARDS_FILE

        }

    };

}


/* ================================================================
   EXPORT
   ================================================================ */

module.exports = {
    createSetManager
};
```
