"use strict";


const statusElement =
    document.getElementById(
        "account-status"
    );


const passwordForm =
    document.getElementById(
        "password-form"
    );


const passwordStatus =
    document.getElementById(
        "password-status"
    );


const changePasswordButton =
    document.getElementById(
        "change-password-button"
    );


const logoutButton =
    document.getElementById(
        "logout-button"
    );


const temporaryPasswordWarning =
    document.getElementById(
        "temporary-password-warning"
    );


function setStatus(
    element,
    message,
    type = ""
) {

    element.textContent =
        message;

    element.className =
        element.id === "account-status"
            ? "status-message"
            : "form-status";


    if (type) {

        element.classList.add(
            type
        );

    }

}


/* ============================================================
   LOAD ACCOUNT
   ============================================================ */

async function loadAccount() {

    try {

        const response =
            await fetch(
                "/api/me",
                {
                    credentials:
                        "same-origin"
                }
            );


        const data =
            await response.json()
                .catch(() => ({}));


        if (!response.ok) {

            window.location.href =
                "./login.html";

            return;

        }


        const player =
            data.player ||
            data;


        document.getElementById(
            "username"
        ).textContent =
            player.username ||
            "Unknown";


        document.getElementById(
            "player-id"
        ).textContent =
            player.id ??
            "Unknown";


        document.getElementById(
            "rank"
        ).textContent =
            player.rank ||
            "player";


        document.getElementById(
            "elo"
        ).textContent =
            player.elo ??
            player.rating ??
            "0";


        document.getElementById(
            "created"
        ).textContent =
            formatDate(
                player.createdAt ||
                player.created
            );


        if (
            player.mustChangePassword
        ) {

            temporaryPasswordWarning.classList.remove(
                "hidden"
            );

        }

    } catch (error) {

        setStatus(
            statusElement,
            "Unable to load your account.",
            "error"
        );

    }

}


/* ============================================================
   CHANGE PASSWORD
   ============================================================ */

passwordForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const currentPassword =
            document.getElementById(
                "current-password"
            ).value;


        const newPassword =
            document.getElementById(
                "new-password"
            ).value;


        const confirmPassword =
            document.getElementById(
                "confirm-password"
            ).value;


        if (
            newPassword !==
            confirmPassword
        ) {

            setStatus(
                passwordStatus,
                "The new passwords do not match.",
                "error"
            );

            return;

        }


        if (
            newPassword.length < 6
        ) {

            setStatus(
                passwordStatus,
                "New password must be at least 6 characters.",
                "error"
            );

            return;

        }


        changePasswordButton.disabled =
            true;


        setStatus(
            passwordStatus,
            "Changing password..."
        );


        try {

            const response =
                await fetch(
                    "/api/auth/change-password",
                    {
                        method: "POST",

                        credentials:
                            "same-origin",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                currentPassword,
                                newPassword
                            })
                    }
                );


            const data =
                await response.json()
                    .catch(() => ({}));


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Could not change password."
                );

            }


            setStatus(
                passwordStatus,
                data.message ||
                "Password changed successfully.",
                "success"
            );


            passwordForm.reset();


            /*
             * The existing server implementation
             * destroys every session belonging to
             * the account after a password change.
             *
             * Send the player back to login after
             * a short delay.
             */

            setTimeout(
                () => {

                    window.location.href =
                        "./login.html";

                },
                1200
            );

        } catch (error) {

            setStatus(
                passwordStatus,
                error.message ||
                "Could not change password.",
                "error"
            );

            changePasswordButton.disabled =
                false;

        }

    }
);


/* ============================================================
   LOGOUT
   ============================================================ */

logoutButton.addEventListener(
    "click",
    async () => {

        logoutButton.disabled =
            true;


        setStatus(
            statusElement,
            "Signing out..."
        );


        try {

            await fetch(
                "/api/auth/logout",
                {
                    method: "POST",

                    credentials:
                        "same-origin"
                }
            );

        } finally {

            window.location.href =
                "./login.html";

        }

    }
);


/* ============================================================
   DATE
   ============================================================ */

function formatDate(value) {

    if (!value) {

        return "Unknown";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(value);

    }


    return date.toLocaleDateString(
        undefined,
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );

}


/* ============================================================
   START
   ============================================================ */

loadAccount();
