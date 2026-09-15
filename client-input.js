/*
 * ============================================================
 * Card Stuff Yes
 * Universal Client Input
 * ============================================================
 *
 * Supports:
 *
 * - Keyboard
 * - Mouse
 * - Touch
 * - Gamepad / Controller
 *
 * All input methods are converted into the same game actions.
 *
 * The game itself should listen for the actions rather than
 * caring which device produced them.
 *
 * ============================================================
 */


/* ============================================================
   INPUT ACTIONS
   ============================================================ */

const INPUT_ACTIONS = Object.freeze({

    UP:
        "up",

    DOWN:
        "down",

    LEFT:
        "left",

    RIGHT:
        "right",

    SELECT:
        "select",

    BACK:
        "back",

    CONTEXT:
        "context",

    INFO:
        "info",

    PREVIOUS:
        "previous",

    NEXT:
        "next",

    ZOOM:
        "zoom",

    PRIMARY:
        "primary",

    SECONDARY:
        "secondary",

    MENU:
        "menu",

    START:
        "start",

    INFO_MENU:
        "info-menu"

});


/* ============================================================
   INPUT DEVICES
   ============================================================ */

const INPUT_DEVICES = Object.freeze({

    KEYBOARD:
        "keyboard",

    MOUSE:
        "mouse",

    TOUCH:
        "touch",

    GAMEPAD:
        "gamepad"

});


/* ============================================================
   DEFAULT CONTROLLER BUTTONS
   ============================================================ */

const GAMEPAD_BUTTONS = Object.freeze({

    A:
        0,

    B:
        1,

    X:
        2,

    Y:
        3,

    LB:
        4,

    RB:
        5,

    LT:
        6,

    RT:
        7,

    SELECT:
        8,

    START:
        9,

    L3:
        10,

    R3:
        11,

    DPAD_UP:
        12,

    DPAD_DOWN:
        13,

    DPAD_LEFT:
        14,

    DPAD_RIGHT:
        15,

    HOME:
        16

});


/* ============================================================
   DEFAULT GAMEPAD AXES
   ============================================================ */

const GAMEPAD_AXES = Object.freeze({

    LEFT_X:
        0,

    LEFT_Y:
        1,

    RIGHT_X:
        2,

    RIGHT_Y:
        3

});


/* ============================================================
   DEFAULT CONTROLLER MAPPING
   ============================================================ */

const DEFAULT_GAMEPAD_BINDINGS = Object.freeze({

    [INPUT_ACTIONS.SELECT]:
        "A",

    [INPUT_ACTIONS.BACK]:
        "B",

    [INPUT_ACTIONS.CONTEXT]:
        "X",

    [INPUT_ACTIONS.INFO]:
        "Y",

    [INPUT_ACTIONS.PREVIOUS]:
        "LB",

    [INPUT_ACTIONS.NEXT]:
        "RB",

    [INPUT_ACTIONS.ZOOM]:
        "LT",

    [INPUT_ACTIONS.PRIMARY]:
        "RT",

    [INPUT_ACTIONS.INFO_MENU]:
        "SELECT",

    [INPUT_ACTIONS.MENU]:
        "START"

});


/* ============================================================
   UNIVERSAL INPUT
   ============================================================ */

class ClientInput {

    constructor(options = {}) {

        this.options = {

            deadzone:
                options.deadzone ??
                0.22,

            repeatDelay:
                options.repeatDelay ??
                280,

            repeatInterval:
                options.repeatInterval ??
                100,

            gamepadPollRate:
                options.gamepadPollRate ??
                50

        };


        this.listeners =
            new Map();


        this.heldActions =
            new Map();


        this.actionStates =
            new Map();


        this.gamepad =
            null;


        this.gamepadIndex =
            null;


        this.lastGamepadPoll =
            0;


        this.lastLeftAxisDirection =
            null;


        this.lastRightAxisDirection =
            null;


        this.gamepadConnected =
            false;


        this.enabled =
            true;


        this.keyboardBindings = {

            ArrowUp:
                INPUT_ACTIONS.UP,

            ArrowDown:
                INPUT_ACTIONS.DOWN,

            ArrowLeft:
                INPUT_ACTIONS.LEFT,

            ArrowRight:
                INPUT_ACTIONS.RIGHT,

            w:
                INPUT_ACTIONS.UP,

            s:
                INPUT_ACTIONS.DOWN,

            a:
                INPUT_ACTIONS.LEFT,

            d:
                INPUT_ACTIONS.RIGHT,

            Enter:
                INPUT_ACTIONS.SELECT,

            " ":
                INPUT_ACTIONS.SELECT,

            Escape:
                INPUT_ACTIONS.BACK,

            e:
                INPUT_ACTIONS.CONTEXT,

            i:
                INPUT_ACTIONS.INFO,

            q:
                INPUT_ACTIONS.PREVIOUS,

            r:
                INPUT_ACTIONS.NEXT,

            z:
                INPUT_ACTIONS.ZOOM,

            f:
                INPUT_ACTIONS.PRIMARY,

            Tab:
                INPUT_ACTIONS.INFO_MENU,

            m:
                INPUT_ACTIONS.MENU

        };


        this.gamepadBindings = {

            ...DEFAULT_GAMEPAD_BINDINGS

        };


        this.boundKeyDown =
            this.handleKeyDown.bind(this);

        this.boundKeyUp =
            this.handleKeyUp.bind(this);

        this.boundGamepadConnected =
            this.handleGamepadConnected.bind(this);

        this.boundGamepadDisconnected =
            this.handleGamepadDisconnected.bind(this);

        this.boundAnimationFrame =
            this.pollGamepad.bind(this);

    }


    /* ========================================================
       START
       ======================================================== */

    start() {

        if (this.started) {

            return;

        }


        this.started =
            true;


        window.addEventListener(
            "keydown",
            this.boundKeyDown
        );


        window.addEventListener(
            "keyup",
            this.boundKeyUp
        );


        window.addEventListener(
            "gamepadconnected",
            this.boundGamepadConnected
        );


        window.addEventListener(
            "gamepaddisconnected",
            this.boundGamepadDisconnected
        );


        this.pollGamepad();

    }


    /* ========================================================
       STOP
       ======================================================== */

    stop() {

        if (!this.started) {

            return;

        }


        this.started =
            false;


        window.removeEventListener(
            "keydown",
            this.boundKeyDown
        );


        window.removeEventListener(
            "keyup",
            this.boundKeyUp
        );


        window.removeEventListener(
            "gamepadconnected",
            this.boundGamepadConnected
        );


        window.removeEventListener(
            "gamepaddisconnected",
            this.boundGamepadDisconnected
        );


        for (const timer of this.heldActions.values()) {

            clearTimeout(
                timer.timeout
            );

            clearInterval(
                timer.interval
            );

        }


        this.heldActions.clear();

    }


    /* ========================================================
       ENABLE / DISABLE
       ======================================================== */

    enable() {

        this.enabled =
            true;

    }


    disable() {

        this.enabled =
            false;

        this.releaseAll();

    }


    /* ========================================================
       LISTENERS
       ======================================================== */

    on(action, callback) {

        if (!this.listeners.has(action)) {

            this.listeners.set(
                action,
                new Set()
            );

        }


        this.listeners
            .get(action)
            .add(callback);


        return () => {

            this.off(
                action,
                callback
            );

        };

    }


    off(action, callback) {

        const callbacks =
            this.listeners.get(action);


        if (!callbacks) {

            return;

        }


        callbacks.delete(
            callback
        );


        if (callbacks.size === 0) {

            this.listeners.delete(
                action
            );

        }

    }


    emit(action, data = {}) {

        if (!this.enabled) {

            return;

        }


        const callbacks =
            this.listeners.get(action);


        if (!callbacks) {

            return;

        }


        for (const callback of callbacks) {

            try {

                callback({

                    action,

                    device:
                        data.device ??
                        null,

                    value:
                        data.value ??
                        null,

                    repeat:
                        data.repeat ??
                        false

                });

            } catch (error) {

                console.error(
                    "Client input listener error:",
                    error
                );

            }

        }

    }


    /* ========================================================
       KEYBOARD
       ======================================================== */

    handleKeyDown(event) {

        if (!this.enabled) {

            return;

        }


        const action =
            this.keyboardBindings[event.key];


        if (!action) {

            return;

        }


        if (
            event.repeat &&
            this.actionStates.get(action)
        ) {

            return;

        }


        event.preventDefault();


        this.press(
            action,
            INPUT_DEVICES.KEYBOARD
        );

    }


    handleKeyUp(event) {

        const action =
            this.keyboardBindings[event.key];


        if (!action) {

            return;

        }


        event.preventDefault();


        this.release(
            action
        );

    }


    /* ========================================================
       GAMEPAD CONNECTION
       ======================================================== */

    handleGamepadConnected(event) {

        this.gamepad =
            event.gamepad;


        this.gamepadIndex =
            event.gamepad.index;


        this.gamepadConnected =
            true;


        this.emitSystemEvent(
            "gamepad-connected",
            event.gamepad
        );

    }


    handleGamepadDisconnected(event) {

        if (
            this.gamepadIndex ===
            event.gamepad.index
        ) {

            this.gamepad =
                null;

            this.gamepadIndex =
                null;

            this.gamepadConnected =
                false;

            this.lastLeftAxisDirection =
                null;

            this.lastRightAxisDirection =
                null;


            this.releaseAll();


            this.emitSystemEvent(
                "gamepad-disconnected",
                event.gamepad
            );

        }

    }


    /* ========================================================
       GAMEPAD POLLING
       ======================================================== */

    pollGamepad(timestamp = 0) {

        if (!this.started) {

            return;

        }


        if (
            timestamp -
            this.lastGamepadPoll <
            this.options.gamepadPollRate
        ) {

            requestAnimationFrame(
                this.boundAnimationFrame
            );

            return;

        }


        this.lastGamepadPoll =
            timestamp;


        const pads =
            navigator.getGamepads
                ? navigator.getGamepads()
                : [];


        let pad =
            null;


        if (
            this.gamepadIndex !== null
        ) {

            pad =
                pads[this.gamepadIndex];

        }


        if (!pad) {

            for (const candidate of pads) {

                if (candidate) {

                    pad =
                        candidate;

                    break;

                }

            }

        }


        if (pad) {

            this.gamepad =
                pad;

            this.gamepadConnected =
                true;


            this.readGamepadButtons(
                pad
            );


            this.readGamepadAxes(
                pad
            );

        }


        requestAnimationFrame(
            this.boundAnimationFrame
        );

    }


    /* ========================================================
       GAMEPAD BUTTONS
       ======================================================== */

    readGamepadButtons(gamepad) {

        for (
            const [action, buttonName]
            of Object.entries(this.gamepadBindings)
        ) {

            const buttonIndex =
                GAMEPAD_BUTTONS[buttonName];


            if (
                buttonIndex === undefined
            ) {

                continue;

            }


            const button =
                gamepad.buttons[
                    buttonIndex
                ];


            if (!button) {

                continue;

            }


            const pressed =
                button.pressed ||
                button.value >
                0.5;


            const previous =
                this.actionStates.get(
                    action
                ) === true;


            if (
                pressed &&
                !previous
            ) {

                this.press(
                    action,
                    INPUT_DEVICES.GAMEPAD
                );

            } else if (
                !pressed &&
                previous
            ) {

                this.release(
                    action
                );

            }

        }

    }


    /* ========================================================
       GAMEPAD AXES
       ======================================================== */

    readGamepadAxes(gamepad) {

        const x =
            gamepad.axes[
                GAMEPAD_AXES.LEFT_X
            ] ??
            0;


        const y =
            gamepad.axes[
                GAMEPAD_AXES.LEFT_Y
            ] ??
            0;


        const horizontal =
            this.axisDirection(
                x
            );


        const vertical =
            this.axisDirection(
                y
            );


        if (
            horizontal !==
            this.lastLeftAxisDirection
        ) {

            if (
                this.lastLeftAxisDirection
            ) {

                this.release(
                    this.lastLeftAxisDirection
                );

            }


            if (horizontal) {

                this.press(
                    horizontal,
                    INPUT_DEVICES.GAMEPAD
                );

            }


            this.lastLeftAxisDirection =
                horizontal;

        }


        if (
            vertical !==
            this.lastRightAxisDirection
        ) {

            if (
                this.lastRightAxisDirection
            ) {

                this.release(
                    this.lastRightAxisDirection
                );

            }


            if (vertical) {

                this.press(
                    vertical,
                    INPUT_DEVICES.GAMEPAD
                );

            }


            this.lastRightAxisDirection =
                vertical;

        }

    }


    /* ========================================================
       AXIS DIRECTION
       ======================================================== */

    axisDirection(value) {

        if (
            Math.abs(value) <
            this.options.deadzone
        ) {

            return null;

        }


        if (value < 0) {

            return INPUT_ACTIONS.UP;

        }


        return INPUT_ACTIONS.DOWN;

    }


    /* ========================================================
       PRESS
       ======================================================== */

    press(action, device) {

        if (!this.enabled) {

            return;

        }


        if (
            this.actionStates.get(action)
        ) {

            return;

        }


        this.actionStates.set(
            action,
            true
        );


        this.emit(
            action,
            {

                device,

                repeat:
                    false

            }
        );


        this.startRepeat(
            action,
            device
        );

    }


    /* ========================================================
       RELEASE
       ======================================================== */

    release(action) {

        this.actionStates.delete(
            action
        );


        const timer =
            this.heldActions.get(
                action
            );


        if (!timer) {

            return;

        }


        clearTimeout(
            timer.timeout
        );


        clearInterval(
            timer.interval
        );


        this.heldActions.delete(
            action
        );

    }


    /* ========================================================
       REPEAT
       ======================================================== */

    startRepeat(action, device) {

        if (
            this.heldActions.has(action)
        ) {

            return;

        }


        const timeout =
            setTimeout(() => {

                const interval =
                    setInterval(() => {

                        if (
                            !this.actionStates.get(
                                action
                            )
                        ) {

                            clearInterval(
                                interval
                            );

                            return;

                        }


                        this.emit(
                            action,
                            {

                                device,

                                repeat:
                                    true

                            }
                        );

                    }, this.options.repeatInterval);


                const current =
                    this.heldActions.get(
                        action
                    );


                if (current) {

                    current.interval =
                        interval;

                }

            }, this.options.repeatDelay);


        this.heldActions.set(
            action,
            {

                timeout,

                interval:
                    null

            }
        );

    }


    /* ========================================================
       RELEASE EVERYTHING
       ======================================================== */

    releaseAll() {

        for (
            const action
            of this.actionStates.keys()
        ) {

            this.release(
                action
            );

        }


        this.actionStates.clear();

    }


    /* ========================================================
       SYSTEM EVENTS
       ======================================================== */

    emitSystemEvent(type, value) {

        const callbacks =
            this.listeners.get(
                type
            );


        if (!callbacks) {

            return;

        }


        for (const callback of callbacks) {

            try {

                callback(value);

            } catch (error) {

                console.error(
                    "Client input system event error:",
                    error
                );

            }

        }

    }


    /* ========================================================
       BINDINGS
       ======================================================== */

    setKeyboardBinding(
        key,
        action
    ) {

        this.keyboardBindings[key] =
            action;

    }


    setGamepadBinding(
        action,
        buttonName
    ) {

        if (
            !Object.prototype.hasOwnProperty.call(
                GAMEPAD_BUTTONS,
                buttonName
            )
        ) {

            throw new Error(
                `Unknown gamepad button: ${buttonName}`
            );

        }


        this.gamepadBindings[action] =
            buttonName;

    }


    getGamepadBindings() {

        return {
            ...this.gamepadBindings
        };

    }


    getKeyboardBindings() {

        return {
            ...this.keyboardBindings
        };

    }

}


/* ============================================================
   GLOBAL CLIENT INPUT
   ============================================================ */

window.CardStuffYesInput =
    new ClientInput();


window.CardStuffYesInput.start();


/* ============================================================
   EXPORTS
   ============================================================ */

window.CardStuffYesInputActions =
    INPUT_ACTIONS;

window.CardStuffYesInputDevices =
    INPUT_DEVICES;

window.CardStuffYesGamepadButtons =
    GAMEPAD_BUTTONS;
