/* ============================================================
   CARD STUFF YES — BADGES MODULE
   ============================================================

   This module manages achievement/special badges.

   Rank badges such as Owner and Moderator are handled by the
   players module because they come from the player's rank.

   This module handles badges stored in the database.

   ============================================================ */


/* ============================================================
   CREATE BADGES MODULE
   ============================================================ */

function createBadgesModule(db) {

    if (!db) {
        throw new Error(
            "A database connection is required."
        );
    }


    /* ========================================================
       CREATE BADGE
       ======================================================== */

    /*
     * Create a new achievement badge.
     */
    function createBadge(
        name,
        imagePath
    ) {

        if (
            typeof name !== "string" ||
            !name.trim()
        ) {

            throw new Error(
                "Badge name is required."
            );

        }


        if (
            typeof imagePath !== "string" ||
            !imagePath.trim()
        ) {

            throw new Error(
                "Badge image path is required."
            );

        }


        const result =
            db.prepare(`
                INSERT INTO badges
                (
                    name,
                    imagePath
                )
                VALUES (?, ?)
            `).run(

                name.trim(),

                imagePath.trim()

            );


        return getBadgeById(
            result.lastInsertRowid
        );

    }


    /* ========================================================
       GET BADGE BY ID
       ======================================================== */

    function getBadgeById(
        badgeId
    ) {

        return db
            .prepare(`
                SELECT
                    id,
                    name,
                    imagePath
                FROM badges
                WHERE id = ?
            `)
            .get(badgeId);

    }


    /* ========================================================
       GET BADGE BY NAME
       ======================================================== */

    function getBadgeByName(
        name
    ) {

        return db
            .prepare(`
                SELECT
                    id,
                    name,
                    imagePath
                FROM badges
                WHERE name = ?
            `)
            .get(name);

    }


    /* ========================================================
       LIST BADGES
       ======================================================== */

    function getAllBadges() {

        return db
            .prepare(`
                SELECT
                    id,
                    name,
                    imagePath
                FROM badges
                ORDER BY id ASC
            `)
            .all();

    }


    /* ========================================================
       GIVE BADGE
       ======================================================== */

    /*
     * Give a player a badge.
     *
     * INSERT OR IGNORE prevents duplicate copies of the same
     * badge being assigned to one player.
     */
    function giveBadge(
        playerId,
        badgeId
    ) {

        db.prepare(`
            INSERT OR IGNORE INTO player_badges
            (
                playerId,
                badgeId
            )
            VALUES (?, ?)
        `).run(

            playerId,

            badgeId

        );

    }


    /* ========================================================
       GIVE BADGE BY NAME
       ======================================================== */

    function giveBadgeByName(
        playerId,
        badgeName
    ) {

        const badge =
            getBadgeByName(
                badgeName
            );


        if (!badge) {

            return false;

        }


        giveBadge(
            playerId,
            badge.id
        );


        return true;

    }


    /* ========================================================
       REMOVE BADGE
       ======================================================== */

    function removeBadge(
        playerId,
        badgeId
    ) {

        db.prepare(`
            DELETE FROM player_badges
            WHERE playerId = ?
              AND badgeId = ?
        `).run(

            playerId,

            badgeId

        );

    }


    /* ========================================================
       GET PLAYER SPECIAL BADGES
       ======================================================== */

    function getPlayerBadges(
        playerId
    ) {

        return db
            .prepare(`
                SELECT
                    badges.id,
                    badges.name,
                    badges.imagePath
                FROM player_badges
                INNER JOIN badges
                    ON badges.id = player_badges.badgeId
                WHERE player_badges.playerId = ?
                ORDER BY badges.id ASC
            `)
            .all(playerId);

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        createBadge,

        getBadgeById,

        getBadgeByName,

        getAllBadges,

        giveBadge,

        giveBadgeByName,

        removeBadge,

        getPlayerBadges

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createBadgesModule

};
