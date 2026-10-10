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
            "Card Stuff Yes alert HTML is missing."
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
    // PUBLIC FUNCTIONS
    // ========================================================

    window.showCsyAlert =
        showAlert;


    window.clearCsyAlert =
        clearAlert;


})();
