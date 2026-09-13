```js id="27531"
/* ============================================================
   CARD STUFF YES — MOBILE SYSTEM
   ============================================================

   This file provides JavaScript support for mobile devices.

   It handles:

   - Detecting touch devices
   - Adding mobile classes
   - Card tap selection
   - Preventing accidental double-tap zoom on game controls
   - Screen/orientation information
   - Safe mobile viewport handling

   The actual game rules are NOT handled here.

   ============================================================ */


/* ============================================================
   MOBILE SYSTEM
   ============================================================ */

window.CardStuffYesMobile = {


    /* ========================================================
       INITIALIZE
       ======================================================== */

    init() {

        this.detectDevice();

        this.setupViewport();

        this.setupCardTouch();

        this.setupTouchControls();

        this.setupOrientation();

    },


    /* ========================================================
       DEVICE DETECTION
       ======================================================== */

    detectDevice() {

        const touchDevice =
            (
                "ontouchstart" in window
            ) ||
            (
                navigator.maxTouchPoints > 0
            );


        document.documentElement
            .classList
            .toggle(
                "touch-device",
                touchDevice
            );


        document.documentElement
            .classList
            .toggle(
                "desktop-device",
                !touchDevice
            );


        /*
         * This is intentionally only a UI hint.
         *
         * The server must NEVER trust this value for gameplay,
         * permissions, or security.
         */

        return touchDevice;

    },


    /* ========================================================
       VIEWPORT SETUP
       ======================================================== */

    setupViewport() {

        /*
         * Update a CSS variable whenever the viewport changes.
         *
         * This helps mobile layouts account for browser UI
         * changing the visible viewport height.
         */

        const updateViewport =
            () => {

                const height =
                    window.visualViewport
                        ? window.visualViewport.height
                        : window.innerHeight;


                document.documentElement
                    .style
                    .setProperty(
                        "--viewport-height",
                        `${height}px`
                    );

            };


        updateViewport();


        window.addEventListener(
            "resize",
            updateViewport
        );


        if (
            window.visualViewport
        ) {

            window.visualViewport
                .addEventListener(
                    "resize",
                    updateViewport
                );

        }

    },


    /* ========================================================
       CARD TOUCH SUPPORT
       ======================================================== */

    setupCardTouch() {

        document.addEventListener(
            "click",
            event => {

                const card =
                    event.target.closest(
                        ".card-item"
                    );


                if (!card) {

                    return;

                }


                /*
                 * A card can opt out of automatic selection by
                 * adding:
                 *
                 *     data-no-mobile-select
                 */

                if (
                    card.hasAttribute(
                        "data-no-mobile-select"
                    )
                ) {

                    return;

                }


                /*
                 * If the page already has a click handler for
                 * the card, this class simply provides a visual
                 * selected state.
                 *
                 * The actual action remains controlled by the
                 * page/game JavaScript.
                 */

                card.classList.toggle(
                    "selected"
                );

            }
        );

    },


    /* ========================================================
       TOUCH CONTROLS
       ======================================================== */

    setupTouchControls() {

        /*
         * Prevent accidental double-tap zoom on controls that
         * are explicitly marked as touch controls.
         *
         * Normal page zoom remains available.
         */

        let lastTouchTime =
            0;


        document.addEventListener(
            "touchend",
            event => {

                const control =
                    event.target.closest(
                        ".touch-control"
                    );


                if (!control) {

                    return;

                }


                const now =
                    Date.now();


                if (
                    now -
                    lastTouchTime <
                    300
                ) {

                    event.preventDefault();

                }


                lastTouchTime =
                    now;

            },
            {
                passive: false
            }
        );

    },


    /* ========================================================
       ORIENTATION
       ======================================================== */

    setupOrientation() {

        const updateOrientation =
            () => {

                const landscape =
                    window.matchMedia(
                        "(orientation: landscape)"
                    ).matches;


                document.documentElement
                    .classList
                    .toggle(
                        "landscape",
                        landscape
                    );


                document.documentElement
                    .classList
                    .toggle(
                        "portrait",
                        !landscape
                    );

            };


        updateOrientation();


        window.addEventListener(
            "resize",
            updateOrientation
        );


        window.addEventListener(
            "orientationchange",
            updateOrientation
        );

    },


    /* ========================================================
       IS TOUCH DEVICE
       ======================================================== */

    isTouchDevice() {

        return (
            "ontouchstart" in window
        ) ||
        (
            navigator.maxTouchPoints > 0
        );

    },


    /* ========================================================
       IS MOBILE-SIZED
       ======================================================== */

    isMobileSized() {

        return (
            window.innerWidth <= 700
        );

    },


    /* ========================================================
       GET VIEWPORT SIZE
       ======================================================== */

    getViewport() {

        return {

            width:
                window.innerWidth,

            height:
                window.innerHeight,

            visualHeight:
                window.visualViewport
                    ? window.visualViewport.height
                    : window.innerHeight

        };

    }

};


/* ============================================================
   AUTOMATIC INITIALIZATION
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        window.CardStuffYesMobile.init();

    }
);
```
