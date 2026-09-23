/* ============================================================
CARD STUFF YES — MOBILE SYSTEM
============================================================ */

window.CardStuffYesMobile = {

init: function () {

    this.detectDevice();

    this.setupViewport();

    this.setupCardTouch();

    this.setupTouchControls();

    this.setupOrientation();
},


/* ========================================================
   DEVICE DETECTION
   ======================================================== */

detectDevice: function () {

    var touchDevice =
        ("ontouchstart" in window) ||
        (navigator.maxTouchPoints > 0);

    document.documentElement.classList.toggle(
        "touch-device",
        touchDevice
    );

    document.documentElement.classList.toggle(
        "desktop-device",
        !touchDevice
    );

    return touchDevice;
},


/* ========================================================
   VIEWPORT
   ======================================================== */

setupViewport: function () {

    function updateViewport() {

        var height =
            window.visualViewport
                ? window.visualViewport.height
                : window.innerHeight;

        document.documentElement.style.setProperty(
            "--viewport-height",
            String(height) + "px"
        );
    }

    updateViewport();

    window.addEventListener(
        "resize",
        updateViewport
    );

    if (window.visualViewport) {

        window.visualViewport.addEventListener(
            "resize",
            updateViewport
        );
    }
},


/* ========================================================
   CARD TOUCH
   ======================================================== */

setupCardTouch: function () {

    document.addEventListener(
        "click",
        function (event) {

            var target =
                event.target;

            if (
                !target ||
                typeof target.closest !==
                "function"
            ) {
                return;
            }

            var card =
                target.closest(".card-item");

            if (!card) {
                return;
            }

            if (
                card.hasAttribute(
                    "data-no-mobile-select"
                )
            ) {
                return;
            }

            card.classList.toggle(
                "selected"
            );
        }
    );
},


/* ========================================================
   TOUCH CONTROLS
   ======================================================== */

setupTouchControls: function () {

    var lastTouchTime = 0;

    document.addEventListener(
        "touchend",
        function (event) {

            var target =
                event.target;

            if (
                !target ||
                typeof target.closest !==
                "function"
            ) {
                return;
            }

            var control =
                target.closest(".touch-control");

            if (!control) {
                return;
            }

            var now =
                Date.now();

            if (
                now - lastTouchTime <
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

setupOrientation: function () {

    function updateOrientation() {

        var landscape =
            window.matchMedia(
                "(orientation: landscape)"
            ).matches;

        document.documentElement.classList.toggle(
            "landscape",
            landscape
        );

        document.documentElement.classList.toggle(
            "portrait",
            !landscape
        );
    }

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
   TOUCH DEVICE
   ======================================================== */

isTouchDevice: function () {

    return (
        ("ontouchstart" in window) ||
        (navigator.maxTouchPoints > 0)
    );
},


/* ========================================================
   MOBILE SIZE
   ======================================================== */

isMobileSized: function () {

    return (
        window.innerWidth <= 700
    );
},


/* ========================================================
   VIEWPORT SIZE
   ======================================================== */

getViewport: function () {

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

function initializeMobileSystem() {

window.CardStuffYesMobile.init();

}

if (
document.readyState ===
"loading"
) {

document.addEventListener(
    "DOMContentLoaded",
    initializeMobileSystem,
    {
        once: true
    }
);

} else {

initializeMobileSystem();

}
