"use strict";

/*
 * Card Stuff Yes — Level 1 and Level 2 alerts
 *
 * Public interface:
 *   window.showCsyAlert(1, "Gameplay error message");
 *   window.showCsyAlert(2, "Critical system failure message");
 *   window.clearCsyAlert();
 *
 * These functions display alerts when called. They do not
 * detect gameplay errors or system failures themselves.
 */

(() => {
    const panel = document.getElementById("csy-alert");
    const title = document.getElementById("csy-alert-title");
    const message = document.getElementById("csy-alert-message");
    const dismissButton = document.getElementById("csy-alert-dismiss");
    const soundButton = document.getElementById("csy-alert-sound");
    const stopButton = document.getElementById("csy-alert-stop");

    if (
        !panel ||
        !title ||
        !message ||
        !dismissButton ||
        !soundButton ||
        !stopButton
    ) {
        console.error("Card Stuff Yes alert HTML is missing.");
        return;
    }

    let audioContext = null;
    let activeNodes = [];
    let levelTwoTimer = null;
    let currentLevel = 0;
    let soundEnabled = false;
    let alertSequence = 0;

    function getAudioContext() {
        if (!audioContext) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error("Web Audio is not supported.");
            }

            audioContext = new AudioContextClass();
        }

        return audioContext;
    }

    function stopSound() {
        if (levelTwoTimer !== null) {
            clearTimeout(levelTwoTimer);
            levelTwoTimer = null;
        }

        for (const node of activeNodes) {
            try {
                if (typeof node.stop === "function") {
                    node.stop();
                }
            } catch {
                // The node may already have stopped.
            }

            try {
                node.disconnect();
            } catch {
                // It may already be disconnected.
            }
        }

        activeNodes = [];
    }

    function makeOscillator(frequency, type, gainValue, duration) {
        const context = getAudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(
            frequency,
            context.currentTime
        );

        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            Math.max(0.0002, gainValue),
            context.currentTime + 0.025
        );
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start();
        oscillator.stop(context.currentTime + duration + 0.03);

        activeNodes.push(oscillator, gain);
    }

    function playGlitchSound() {
        stopSound();

        const context = getAudioContext();
        const sampleRate = context.sampleRate;
        const duration = 0.65;
        const buffer = context.createBuffer(
            1,
            Math.floor(sampleRate * duration),
            sampleRate
        );

        const data = buffer.getChannelData(0);

        // Short bursts of filtered digital-style noise.
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const burst = Math.sin(time * 2 * Math.PI * 7) > 0.35;
            data[i] = burst ? (Math.random() * 2 - 1) * 0.35 : 0;
        }

        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();

        source.buffer = buffer;

        filter.type = "bandpass";
        filter.frequency.value = 1500;
        filter.Q.value = 0.8;

        gain.gain.setValueAtTime(0.16, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + duration
        );

        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);

        source.start();
        source.stop(context.currentTime + duration);

        activeNodes.push(source, filter, gain);

        // A short descending glitch tone underneath the noise.
        makeOscillator(310, "sawtooth", 0.035, 0.22);
    }

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
            const context = getAudioContext();

            if (context.state === "suspended") {
                return;
            }

            // A distinct two-tone emergency signal.
            makeOscillator(880, "square", 0.045, 0.28);

            levelTwoTimer = setTimeout(() => {
                if (
                    sequence !== alertSequence ||
                    !soundEnabled ||
                    currentLevel !== 2
                ) {
                    return;
                }

                try {
                    makeOscillator(660, "square", 0.045, 0.28);
                } catch (error) {
                    console.warn("Could not play critical alarm.", error);
                }

                levelTwoTimer = setTimeout(
                    () => playCriticalAlarm(sequence),
                    650
                );
            }, 330);
        } catch (error) {
            console.warn("Could not play critical alarm.", error);
        }
    }

    async function enableSounds() {
        try {
            const context = getAudioContext();
            await context.resume();

            soundEnabled = true;
            soundButton.textContent = "Mute alert sounds";

            if (currentLevel === 1) {
                playGlitchSound();
            } else if (currentLevel === 2) {
                playCriticalAlarm(alertSequence);
            }
        } catch (error) {
            soundEnabled = false;
            soundButton.textContent = "Enable alert sounds";
            console.warn("Alert sound could not be enabled.", error);
        }
    }

    function showAlert(level, text) {
        if (level !== 1 && level !== 2) {
            console.warn("Only alert levels 1 and 2 are supported here.");
            return;
        }

        alertSequence += 1;
        stopSound();

        currentLevel = level;
        panel.classList.toggle("level-1", level === 1);
        panel.classList.toggle("level-2", level === 2);

        title.textContent = level === 1
            ? "LEVEL 1 — GAMEPLAY ERROR"
            : "LEVEL 2 — CRITICAL SYSTEM FAILURE";

        message.textContent = String(
            text || (
                level === 1
                    ? "A gameplay error occurred."
                    : "A critical system failure was reported."
            )
        );

        panel.hidden = false;

        if (soundEnabled) {
            try {
                if (level === 1) {
                    playGlitchSound();
                } else {
                    playCriticalAlarm(alertSequence);
                }
            } catch (error) {
                console.warn("Alert sound could not be played.", error);
            }
        }
    }

    function clearAlert() {
        alertSequence += 1;
        stopSound();

        currentLevel = 0;
        panel.hidden = true;
        panel.classList.remove("level-1", "level-2");
        message.textContent = "";
    }

    dismissButton.addEventListener("click", clearAlert);

    stopButton.addEventListener("click", () => {
        stopSound();
    });

    soundButton.addEventListener("click", async () => {
        if (soundEnabled) {
            soundEnabled = false;
            stopSound();
            soundButton.textContent = "Enable alert sounds";
            return;
        }

        await enableSounds();
    });

    window.showCsyAlert = showAlert;
    window.clearCsyAlert = clearAlert;
})();
