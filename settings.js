/*
 * ============================================================
 * Card Stuff Yes
 * Settings System
 * ============================================================
 *
 * Stores client settings locally and exposes them globally.
 *
 * Gameplay is never stored here.
 * Server-authoritative values remain server-authoritative.
 *
 * ============================================================
 */


(function () {

    "use strict";


    const STORAGE_KEY =
        "card-stuff-yes-settings";


    /*
     * ============================================================
     * DEFAULT SETTINGS
     * ============================================================
     */

    const DEFAULT_SETTINGS = {

        /*
         * Gameplay
         */

        animations:
            "full",

        battleAnimationSpeed:
            "1",

        cardZoomBehaviour:
            "hold",

        autoEndTurn:
            false,

        confirmActions:
            true,

        showDamageNumbers:
            true,

        showResourceChanges:
            true,

        showAbilityNames:
            true,


        /*
         * Graphics
         */

        graphicsQuality:
            "auto",

        compatibilityMode:
            "auto",

        renderingEngine:
            "auto",

        textureQuality:
            "auto",

        pack3DQuality:
            "auto",

        packDisplay:
            "auto",

        vfxQuality:
            "high",

        particleEffects:
            "on",

        screenEffects:
            "on",

        shadows:
            "on",

        antiAliasing:
            "auto",

        frameRateLimit:
            "auto",

        resolutionScale:
            "auto",


        /*
         * Performance
         */

        memoryBudget:
            "1024",

        assetCaching:
            true,

        keep3DAssetsCached:
            true,

        backgroundRendering:
            true,

        performanceMode:
            false,

        lowPowerMode:
            false,


        /*
         * Audio
         */

        masterVolume:
            100,

        musicVolume:
            100,

        sfxVolume:
            100,

        attackSfxVolume:
            100,

        uiVolume:
            100,

        cardPackSounds:
            true,

        battleSounds:
            true,

        muteWhenUnfocused:
            false,


        /*
         * Interface
         */

        uiScale:
            "100",

        compactUI:
            false,

        showCardIDs:
            false,

        showRarity:
            true,

        showIllustrator:
            true,


        /*
         * Accessibility
         */

        reducedMotion:
            false,

        highContrast:
            false,

        colorblindMode:
            "off",

        largerText:
            false,

        screenShake:
            true,

        flashingEffects:
            "on",


        /*
         * Network
         */

        showPing:
            true,

        showConnectionStatus:
            true,

        autoReconnect:
            true,

        autoDownloadAssets:
            true,


        /*
         * Controls
         */

        inputDevice:
            "auto",

        controllerVibration:
            true,

        vibrationStrength:
            100,

        mouseSensitivity:
            100,

        gamepadSensitivity:
            100,

        invertX:
            false,

        invertY:
            false,


        /*
         * Account / Privacy
         */

        onlineStatus:
            "online",

        friendRequests:
            "everyone",

        tradeRequests:
            true,

        donationRequests:
            true,

        battleInvites:
            true,

        showElo:
            true,


        /*
         * Advanced
         */

        showFPS:
            false,

        showDebug:
            false,

        showRendererInfo:
            false,

        showAssetStats:
            false

    };


    /*
     * ============================================================
     * LOAD
     * ============================================================
     */

    function loadSettings() {

        let saved = {};

        try {

            const raw =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (raw) {

                saved =
                    JSON.parse(raw);

            }

        } catch (error) {

            console.warn(
                "Card Stuff Yes settings could not be loaded.",
                error
            );

        }


        return {
            ...DEFAULT_SETTINGS,
            ...(saved || {})
        };

    }


    let settings =
        loadSettings();


    /*
     * ============================================================
     * SAVE
     * ============================================================
     */

    function saveSettings() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(settings)
            );

        } catch (error) {

            console.warn(
                "Card Stuff Yes settings could not be saved.",
                error
            );

        }


        applySettings();

    }


    /*
     * ============================================================
     * GET / SET
     * ============================================================
     */

    function getSetting(name) {

        return settings[name];

    }


    function setSetting(name, value) {

        if (
            !Object.prototype.hasOwnProperty.call(
                DEFAULT_SETTINGS,
                name
            )
        ) {

            console.warn(
                `Unknown Card Stuff Yes setting: ${name}`
            );

            return;

        }


        settings[name] =
            value;

        saveSettings();

    }


    function getAllSettings() {

        return {
            ...settings
        };

    }


    /*
     * ============================================================
     * COMPATIBILITY MODE
     * ============================================================
     *
     * This calculates an effective graphics profile.
     * Individual settings can still override it later.
     * ============================================================
     */

    function getCompatibilityProfile() {

        const mode =
            settings.compatibilityMode;


        if (mode === "maximumCompatibility") {

            return {

                graphicsQuality:
                    "low",

                renderingEngine:
                    "compatibility",

                textureQuality:
                    "low",

                pack3DQuality:
                    "low",

                vfxQuality:
                    "low",

                particleEffects:
                    "off",

                screenEffects:
                    "reduced",

                shadows:
                    "off",

                antiAliasing:
                    "off",

                frameRateLimit:
                    "30",

                resolutionScale:
                    "75",

                memoryBudget:
                    "512"

            };

        }


        if (mode === "balanced") {

            return {

                graphicsQuality:
                    "medium",

                renderingEngine:
                    "auto",

                textureQuality:
                    "medium",

                pack3DQuality:
                    "medium",

                vfxQuality:
                    "medium",

                particleEffects:
                    "reduced",

                screenEffects:
                    "reduced",

                shadows:
                    "low",

                antiAliasing:
                    "low",

                frameRateLimit:
                    "60",

                resolutionScale:
                    "100",

                memoryBudget:
                    "1024"

            };

        }


        if (mode === "maximumQuality") {

            return {

                graphicsQuality:
                    "ultra",

                renderingEngine:
                    "auto",

                textureQuality:
                    "high",

                pack3DQuality:
                    "high",

                vfxQuality:
                    "high",

                particleEffects:
                    "on",

                screenEffects:
                    "on",

                shadows:
                    "on",

                antiAliasing:
                    "high",

                frameRateLimit:
                    "unlimited",

                resolutionScale:
                    "100",

                memoryBudget:
                    "2048"

            };

        }


        return {};

    }


    /*
     * ============================================================
     * EFFECTIVE SETTING
     * ============================================================
     */

    function getEffectiveSetting(name) {

        const compatibility =
            getCompatibilityProfile();


        if (
            settings.compatibilityMode !== "auto" &&
            Object.prototype.hasOwnProperty.call(
                compatibility,
                name
            ) &&
            settings[name] === DEFAULT_SETTINGS[name]
        ) {

            return compatibility[name];

        }


        return settings[name];

    }


    /*
     * ============================================================
     * RENDERER DETECTION
     * ============================================================
     */

    function supportsWebGPU() {

        return !!(
            navigator.gpu
        );

    }


    function supportsWebGL2() {

        try {

            const canvas =
                document.createElement(
                    "canvas"
                );

            return !!(
                canvas.getContext(
                    "webgl2"
                )
            );

        } catch (error) {

            return false;

        }

    }


    function getPreferredRenderingEngine() {

        const selected =
            getEffectiveSetting(
                "renderingEngine"
            );


        if (
            selected === "webgpu" &&
            supportsWebGPU()
        ) {

            return "webgpu";

        }


        if (
            selected === "webgl2" &&
            supportsWebGL2()
        ) {

            return "webgl2";

        }


        if (
            selected === "compatibility"
        ) {

            return "compatibility";

        }


        /*
         * Auto selection.
         */

        if (supportsWebGPU()) {

            return "webgpu";

        }


        if (supportsWebGL2()) {

            return "webgl2";

        }


        return "compatibility";

    }


    /*
     * ============================================================
     * APPLY SETTINGS
     * ============================================================
     */

    function applySettings() {

        const root =
            document.documentElement;


        root.dataset.graphicsQuality =
            getEffectiveSetting(
                "graphicsQuality"
            );

        root.dataset.renderingEngine =
            getPreferredRenderingEngine();

        root.dataset.textureQuality =
            getEffectiveSetting(
                "textureQuality"
            );

        root.dataset.vfxQuality =
            getEffectiveSetting(
                "vfxQuality"
            );

        root.dataset.packDisplay =
            getEffectiveSetting(
                "packDisplay"
            );


        root.style.setProperty(
            "--csys-ui-scale",
            `${settings.uiScale / 100}`
        );


        if (settings.largerText) {

            root.dataset.largerText =
                "true";

        } else {

            delete root.dataset.largerText;

        }


        if (
            settings.reducedMotion ||
            settings.animations === "off"
        ) {

            root.dataset.reducedMotion =
                "true";

        } else {

            delete root.dataset.reducedMotion;

        }


        if (settings.highContrast) {

            root.dataset.highContrast =
                "true";

        } else {

            delete root.dataset.highContrast;

        }

    }


    /*
     * ============================================================
     * RESET
     * ============================================================
     */

    function resetAll() {

        settings =
            {
                ...DEFAULT_SETTINGS
            };

        saveSettings();

    }


    function resetGraphics() {

        const graphicsKeys = [

            "graphicsQuality",
            "compatibilityMode",
            "renderingEngine",
            "textureQuality",
            "pack3DQuality",
            "packDisplay",
            "vfxQuality",
            "particleEffects",
            "screenEffects",
            "shadows",
            "antiAliasing",
            "frameRateLimit",
            "resolutionScale",
            "memoryBudget",
            "assetCaching",
            "keep3DAssetsCached",
            "performanceMode",
            "lowPowerMode"

        ];


        for (
            const key of graphicsKeys
        ) {

            settings[key] =
                DEFAULT_SETTINGS[key];

        }


        saveSettings();

    }


    function resetControls() {

        const controlKeys = [

            "inputDevice",
            "controllerVibration",
            "vibrationStrength",
            "mouseSensitivity",
            "gamepadSensitivity",
            "invertX",
            "invertY"

        ];


        for (
            const key of controlKeys
        ) {

            settings[key] =
                DEFAULT_SETTINGS[key];

        }


        saveSettings();

    }


    /*
     * ============================================================
     * PAGE UI
     * ============================================================
     */

    function updateControls() {

        const controls =
            document.querySelectorAll(
                "[data-setting]"
            );


        for (
            const control of controls
        ) {

            const name =
                control.dataset.setting;


            if (
                !Object.prototype.hasOwnProperty.call(
                    settings,
                    name
                )
            ) {

                continue;

            }


            if (
                control.type ===
                "checkbox"
            ) {

                control.checked =
                    !!settings[name];

            } else {

                control.value =
                    String(
                        settings[name]
                    );

            }

        }

    }


    function bindControls() {

        const controls =
            document.querySelectorAll(
                "[data-setting]"
            );


        for (
            const control of controls
        ) {

            control.addEventListener(
                "change",
                () => {

                    const name =
                        control.dataset.setting;


                    let value;


                    if (
                        control.type ===
                        "checkbox"
                    ) {

                        value =
                            control.checked;

                    } else if (
                        control.type ===
                        "range"
                    ) {

                        value =
                            Number(
                                control.value
                            );

                    } else {

                        value =
                            control.value;

                    }


                    setSetting(
                        name,
                        value
                    );


                    showStatus(
                        "Settings saved."
                    );

                }
            );

        }

    }


    function showStatus(message) {

        const status =
            document.getElementById(
                "settings-status"
            );


        if (!status) {

            return;

        }


        status.textContent =
            message;


        clearTimeout(
            showStatus.timeout
        );


        showStatus.timeout =
            setTimeout(
                () => {

                    status.textContent =
                        "";

                },
                2000
            );

    }


    function bindButtons() {

        document
            .getElementById(
                "reset-graphics-button"
            )
            ?.addEventListener(
                "click",
                () => {

                    resetGraphics();

                    updateControls();

                    showStatus(
                        "Graphics settings reset."
                    );

                }
            );


        document
            .getElementById(
                "reset-controls-button"
            )
            ?.addEventListener(
                "click",
                () => {

                    resetControls();

                    updateControls();

                    showStatus(
                        "Controls reset."
                    );

                }
            );


        document
            .getElementById(
                "reset-all-button"
            )
            ?.addEventListener(
                "click",
                () => {

                    resetAll();

                    updateControls();

                    showStatus(
                        "All settings reset."
                    );

                }
            );


        document
            .getElementById(
                "clear-cache-button"
            )
            ?.addEventListener(
                "click",
                async () => {

                    if (
                        "caches" in window
                    ) {

                        const keys =
                            await caches.keys();


                        await Promise.all(
                            keys.map(
                                key =>
                                    caches.delete(
                                        key
                                    )
                            )
                        );

                    }


                    showStatus(
                        "Cached assets cleared."
                    );

                }
            );


        document
            .getElementById(
                "remap-controls-button"
            )
            ?.addEventListener(
                "click",
                () => {

                    /*
                     * The actual controller/keybind
                     * remapping UI will use the universal
                     * ClientInput system.
                     */

                    showStatus(
                        "Control remapping will open here."
                    );

                }
            );

    }


    /*
     * ============================================================
     * GLOBAL API
     * ============================================================
     */

    window.CardStuffYesSettings = {

        get:
            getSetting,

        set:
            setSetting,

        getAll:
            getAllSettings,

        getEffective:
            getEffectiveSetting,

        getCompatibilityProfile,

        getPreferredRenderingEngine,

        supportsWebGPU,

        supportsWebGL2,

        apply:
            applySettings,

        resetAll,

        resetGraphics,

        resetControls

    };


    /*
     * ============================================================
     * STARTUP
     * ============================================================
     */

    applySettings();


    document.addEventListener(
        "DOMContentLoaded",
        () => {

            updateControls();

            bindControls();

            bindButtons();

        }
    );

})();
