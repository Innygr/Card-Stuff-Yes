"use strict";

/*
 * ============================================================
 * CARD STUFF YES — HOMEPAGE SYSTEM ALERTS
 * ============================================================
 *
 * LEVEL 1:
 * Gameplay error.
 * Plays GasterPhone.mp3.
 *
 * LEVEL 2:
 * Critical system failure.
 * Plays a distinct repeating two-tone alarm.
 *
 * LEVEL 3:
 * Security breach.
 * Handled separately by the Security Lockdown system.
 *
 * Public interface:
 *
 * window.showCsyAlert(1, "Gameplay error message");
 * window.showCsyAlert(2, "Critical system failure message");
 * window.clearCsyAlert();
 *
 * This file displays alerts when called.
 * It does not detect errors or system failures itself.
 * ============================================================
 */


(() => {

    // ========================================================
    // HTML ELEMENTS
    // ========================================================
    //
    // The homepage already contains this markup. The in-game
    // page can omit it; in that case, create it automatically.
    // ========================================================

    function ensureAlertMarkup() {

        if (document.getElementById("csy-alert")) {
            return;
        }

        const panelMarkup = document.createElement("section");

        panelMarkup.id = "csy-alert";
        panelMarkup.className = "csy-alert";
        panelMarkup.setAttribute("role", "alert");
        panelMarkup.setAttribute("aria-live", "assertive");
        panelMarkup.setAttribute("aria-atomic", "true");
        panelMarkup.hidden = true;

        panelMarkup.innerHTML = `
            <div class="csy-alert-header">
                <strong id="csy-alert-title">SYSTEM ALERT</strong>
                <button
                    id="csy-alert-dismiss"
                    class="csy-alert-dismiss"
                    type="button"
                    aria-label="Dismiss alert"
                >×</button>
            </div>
            <p id="csy-alert-message"></p>
            <div class="csy-alert-actions">
                <button id="csy-alert-sound" type="button">
                    Enable alert sounds
                </button>
                <button id="csy-alert-stop" type="button">
                    Stop sound
                </button>
            </div>
        `;

        document.body.prepend(panelMarkup);
    }

    ensureAlertMarkup();

    const panel =
        document.getElementById("csy-alert");

    const title =
        document.getElementById("csy-alert-title");

    const message =
        document.getElementById("csy-alert-message");

    const dismissButton =
        document.getElementById("csy-alert-dismiss");

    const soundButton =
        document.getElementById("csy-alert-sound");

    const stopButton =
        document.getElementById("csy-alert-stop");

    if (
        !panel ||
        !title ||
        !message ||
        !dismissButton ||
        !soundButton ||
        !stopButton
    ) {
        console.error(
            "Card Stuff Yes alert UI could not be initialized."
        );
        return;
    }


    // ========================================================
    // STATE
    // ========================================================

    let audioContext = null;

    let activeNodes = [];

    let levelTwoTimer = null;

    let gasterPhoneAudio = null;

    let currentLevel = 0;

    let soundEnabled = false;

    let alertSequence = 0;


    // ========================================================
    // AUDIO CONTEXT
    // ========================================================

    function getAudioContext() {

        if (!audioContext) {

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;


            if (!AudioContextClass) {

                throw new Error(
                    "Web Audio is not supported."
                );

            }


            audioContext =
                new AudioContextClass();

        }


        return audioContext;

    }


    // ========================================================
    // STOP ALL ALERT AUDIO
    // ========================================================

    function stopSound() {

        if (levelTwoTimer !== null) {

            clearTimeout(
                levelTwoTimer
            );

            levelTwoTimer = null;

        }


        // Stop GasterPhone.mp3.

        if (gasterPhoneAudio) {

            gasterPhoneAudio.pause();

            gasterPhoneAudio.currentTime = 0;

        }


        // Stop generated Level 2 audio.

        for (const node of activeNodes) {

            try {

                if (
                    typeof node.stop === "function"
                ) {

                    node.stop();

                }

            } catch {

                // The audio node may already have stopped.

            }


            try {

                node.disconnect();

            } catch {

                // The audio node may already be disconnected.

            }

        }


        activeNodes = [];

    }


    // ========================================================
    // LEVEL 1 — GASTER PHONE
    // ========================================================

    function playGasterPhoneSound() {

        stopSound();


        if (!gasterPhoneAudio) {

            gasterPhoneAudio =
                new Audio(
                    "./GasterPhone.mp3"
                );


            gasterPhoneAudio.loop =
                false;


            gasterPhoneAudio.volume =
                0.7;

        }


        // Start the sound from the beginning.

        gasterPhoneAudio.currentTime =
            0;


        const playback =
            gasterPhoneAudio.play();


        if (playback) {

            playback.catch((error) => {

                console.warn(
                    "Could not play GasterPhone.mp3. " +
                    "Check its file path and browser audio permissions.",
                    error
                );

            });

        }

    }


    // ========================================================
    // GENERATED AUDIO HELPER
    // ========================================================

    function makeOscillator(
        frequency,
        type,
        gainValue,
        duration
    ) {

        const context =
            getAudioContext();


        const oscillator =
            context.createOscillator();


        const gain =
            context.createGain();


        oscillator.type =
            type;


        oscillator.frequency.setValueAtTime(
            frequency,
            context.currentTime
        );


        gain.gain.setValueAtTime(
            0.0001,
            context.currentTime
        );


        gain.gain.exponentialRampToValueAtTime(
            Math.max(
                0.0002,
                gainValue
            ),
            context.currentTime + 0.025
        );


        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + duration
        );


        oscillator.connect(gain);

        gain.connect(
            context.destination
        );


        oscillator.start();


        oscillator.stop(
            context.currentTime +
            duration +
            0.03
        );


        activeNodes.push(
            oscillator,
            gain
        );

    }


    // ========================================================
    // LEVEL 2 — CRITICAL SYSTEM FAILURE ALARM
    // ========================================================

    function playCriticalAlarm(sequence) {

        if (
            sequence !== alertSequence ||
            !soundEnabled ||
            currentLevel !== 2
        ) {

            return;

        }


        stopSound();


        try {

            const context =
                getAudioContext();


            if (
                context.state === "suspended"
            ) {

                return;

            }


            // First emergency tone.

            makeOscillator(
                880,
                "square",
                0.045,
                0.28
            );


            levelTwoTimer =
                setTimeout(() => {

                    if (
                        sequence !== alertSequence ||
                        !soundEnabled ||
                        currentLevel !== 2
                    ) {

                        return;

                    }


                    try {

                        // Second emergency tone.

                        makeOscillator(
                            660,
                            "square",
                            0.045,
                            0.28
                        );

                    } catch (error) {

                        console.warn(
                            "Could not play critical alarm.",
                            error
                        );

                    }


                    levelTwoTimer =
                        setTimeout(
                            () => {

                                playCriticalAlarm(
                                    sequence
                                );

                            },
                            650
                        );

                }, 330);

        } catch (error) {

            console.warn(
                "Could not play critical alarm.",
                error
            );

        }

    }


    // ========================================================
    // ENABLE SOUND AFTER USER INTERACTION
    // ========================================================

    async function enableSounds() {

        try {

            const context =
                getAudioContext();


            await context.resume();


            soundEnabled =
                true;


            soundButton.textContent =
                "Mute alert sounds";


            if (currentLevel === 1) {

                playGasterPhoneSound();

            } else if (currentLevel === 2) {

                playCriticalAlarm(
                    alertSequence
                );

            }

        } catch (error) {

            soundEnabled =
                false;


            soundButton.textContent =
                "Enable alert sounds";


            console.warn(
                "Alert sound could not be enabled.",
                error
            );

        }

    }


    // ========================================================
    // SHOW LEVEL 1 OR LEVEL 2 ALERT
    // ========================================================

    function showAlert(
        level,
        text
    ) {

        if (
            level !== 1 &&
            level !== 2
        ) {

            console.warn(
                "This alert component supports Level 1 and Level 2 only."
            );

            return;

        }


        // Keep a critical system failure visible if a lower
        // severity application error occurs afterward.
        if (currentLevel === 2 && level === 1) {
            return;
        }

        // Invalidate any previous repeating alarm.
        alertSequence += 1;

        stopSound();

        currentLevel =
            level;


        // Apply the correct visual style.

        panel.classList.toggle(
            "level-1",
            level === 1
        );


        panel.classList.toggle(
            "level-2",
            level === 2
        );


        // Set the alert title.

        title.textContent =
            level === 1
                ? "LEVEL 1 — GAMEPLAY ERROR"
                : "LEVEL 2 — CRITICAL SYSTEM FAILURE";


        // Use textContent to avoid treating messages as HTML.

        message.textContent =
            String(
                text || (
                    level === 1
                        ? "A gameplay error occurred."
                        : "A critical system failure was reported."
                )
            );


        panel.hidden =
            false;


        // Play audio only if the user has enabled it.

        if (soundEnabled) {

            try {

                if (level === 1) {

                    playGasterPhoneSound();

                } else {

                    playCriticalAlarm(
                        alertSequence
                    );

                }

            } catch (error) {

                console.warn(
                    "Alert sound could not be played.",
                    error
                );

            }

        }

    }


    // ========================================================
    // CLEAR CURRENT ALERT
    // ========================================================

    function clearAlert() {

        alertSequence += 1;


        stopSound();


        currentLevel =
            0;


        panel.hidden =
            true;


        panel.classList.remove(
            "level-1",
            "level-2"
        );


        message.textContent =
            "";

    }


    // ========================================================
    // DISMISS BUTTON
    // ========================================================

    dismissButton.addEventListener(
        "click",
        () => {

            clearAlert();

        }
    );


    // ========================================================
    // STOP SOUND BUTTON
    // ========================================================

    stopButton.addEventListener(
        "click",
        () => {

            stopSound();

        }
    );


    // ========================================================
    // SOUND ENABLE / MUTE BUTTON
    // ========================================================

    soundButton.addEventListener(
        "click",
        async () => {

            if (soundEnabled) {

                soundEnabled =
                    false;


                stopSound();


                soundButton.textContent =
                    "Enable alert sounds";


                return;

            }


            await enableSounds();

        }
    );


    // ========================================================
    // PUBLIC FUNCTIONS AND EVENT INTEGRATION
    // ========================================================
    //
    // Gameplay modules should call:
    //   window.reportCsyGameplayError("Card action failed.");
    //
    // A trusted system-health monitor should call:
    //   window.reportCsyCriticalFailure("Game service unavailable.");
    //
    // The equivalent events are:
    //   csy:gameplay-error
    //   csy:critical-system-failure
    //
    // Critical failures are never inferred from an ordinary
    // network error or from a possible security incident.
    // ========================================================

    window.showCsyAlert =
        showAlert;

    window.clearCsyAlert =
        clearAlert;

    function getErrorMessage(value) {
        if (value instanceof Error) {
            return value.message || value.name || "Unknown error";
        }

        if (value && typeof value.message === "string") {
            return value.message;
        }

        if (typeof value === "string") {
            return value;
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    let lastReportedError = "";
    let lastReportedErrorAt = 0;

    function reportCsyGameplayError(value) {
        const detail = getErrorMessage(value) ||
            "An unexpected application error occurred.";
        const now = Date.now();
        const key = "level-1:" + detail;

        // Browser error and unhandled-rejection events can describe
        // the same failure; avoid showing the exact same alert twice.
        if (
            key === lastReportedError &&
            now - lastReportedErrorAt < 5000
        ) {
            return;
        }

        lastReportedError = key;
        lastReportedErrorAt = now;

        showAlert(
            1,
            "The application encountered an error: " + detail
        );
    }

    function reportCsyCriticalFailure(value) {
        const detail = getErrorMessage(value) ||
            "A critical system failure was reported.";

        showAlert(
            2,
            "Critical system failure: " + detail
        );
    }

    window.reportCsyGameplayError =
        reportCsyGameplayError;

    window.reportCsyCriticalFailure =
        reportCsyCriticalFailure;

    window.addEventListener(
        "csy:gameplay-error",
        (event) => {
            reportCsyGameplayError(
                event.detail ?? "A gameplay error was reported."
            );
        }
    );

    window.addEventListener(
        "csy:critical-system-failure",
        (event) => {
            reportCsyCriticalFailure(
                event.detail ?? "A critical system failure was reported."
            );
        }
    );

    // Uncaught same-origin JavaScript errors are genuine application
    // failures and should raise Level 1. Ignore generic cross-origin
    // "Script error." messages because they do not identify our code.
    window.addEventListener(
        "error",
        (event) => {
            if (!(event instanceof ErrorEvent)) {
                return;
            }

            if (
                event.filename &&
                !event.filename.startsWith(window.location.origin)
            ) {
                return;
            }

            if (
                !event.message ||
                event.message === "Script error."
            ) {
                return;
            }

            reportCsyGameplayError(
                event.message +
                (event.filename ? " (" + event.filename + ")" : "") +
                (event.lineno ? ":" + event.lineno : "")
            );
        }
    );

    // Unhandled promise rejections are also Level 1 unless the
    // responsible system explicitly reports a critical failure.
    window.addEventListener(
        "unhandledrejection",
        (event) => {
            reportCsyGameplayError(
                event.reason ??
                "An unhandled asynchronous operation failed."
            );
        }
    );

})();
