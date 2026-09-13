```javascript
/* ================================================================
   CARD STUFF YES - GLOBAL LOADING SCREEN
   ================================================================ */


/* ================================================================
   LOADING STATE
   ================================================================ */

const LoadingScreen = {

    /* ------------------------------------------------------------
       DOM ELEMENTS

       These are populated by init().
       ------------------------------------------------------------ */

    screen: null,

    dots: null,

    progressContainer: null,

    progress: null,

    progressText: null,

    destination: null,


    /* ------------------------------------------------------------
       DOT ANIMATION

       The animation has four frames:

           ""
           "."
           ".."
           "..."

       The empty frame is intentionally invisible.

       The animation then loops back to the empty frame.
       ------------------------------------------------------------ */

    dotFrames: [

        "",

        ".",

        "..",

        "..."

    ],


    dotIndex: 0,

    dotTimer: null,


    /* ------------------------------------------------------------
       INITIALIZE

       Finds the loading-screen elements and starts the animated
       dots.
       ------------------------------------------------------------ */

    init() {

        this.screen =
            document.getElementById(
                "loading-screen"
            );

        this.dots =
            document.getElementById(
                "loading-dots"
            );

        this.progressContainer =
            document.getElementById(
                "loading-progress-container"
            );

        this.progress =
            document.getElementById(
                "loading-progress"
            );

        this.progressText =
            document.getElementById(
                "loading-progress-text"
            );

        this.destination =
            document.getElementById(
                "loading-destination"
            );


        if (!this.screen) {

            return;

        }


        this.startDots();

    },


    /* ------------------------------------------------------------
       START DOTS

       Updates the dot animation every 350 milliseconds.

       The first frame is empty.
       ------------------------------------------------------------ */

    startDots() {

        if (!this.dots) {

            return;

        }


        this.dotIndex = 0;

        this.updateDots();


        this.dotTimer =
            window.setInterval(
                () => {

                    this.dotIndex++;

                    if (
                        this.dotIndex >=
                        this.dotFrames.length
                    ) {

                        this.dotIndex = 0;

                    }


                    this.updateDots();

                },

                350

            );

    },


    /* ------------------------------------------------------------
       UPDATE DOTS
       ------------------------------------------------------------ */

    updateDots() {

        if (!this.dots) {

            return;

        }


        this.dots.textContent =
            this.dotFrames[this.dotIndex];

    },


    /* ------------------------------------------------------------
       STOP DOTS
       ------------------------------------------------------------ */

    stopDots() {

        if (this.dotTimer !== null) {

            window.clearInterval(
                this.dotTimer
            );

            this.dotTimer = null;

        }

    },


    /* ------------------------------------------------------------
       SET DESTINATION

       Example:

           LoadingScreen.setDestination(
               "Loading homepage"
           );

       The text can be changed at any time.
       ------------------------------------------------------------ */

    setDestination(text) {

        if (!this.destination) {

            return;

        }


        this.destination.textContent =
            String(text ?? "Loading");

    },


    /* ------------------------------------------------------------
       SHOW PROGRESS

       Displays the progress bar and sets its percentage.

       This should only be used when the application has actual
       progress information.

       Example:

           LoadingScreen.setProgress(50);
       ------------------------------------------------------------ */

    setProgress(percent) {

        if (
            !this.progressContainer ||
            !this.progress
        ) {

            return;

        }


        let value =
            Number(percent);


        if (!Number.isFinite(value)) {

            return;

        }


        value =
            Math.max(
                0,
                Math.min(
                    100,
                    value
                )
            );


        this.progressContainer.hidden =
            false;


        this.progress.style.width =
            `${value}%`;


        if (this.progressText) {

            this.progressText.textContent =
                `${Math.round(value)}%`;

        }


        const track =
            this.progressContainer.querySelector(
                ".loading-progress-track"
            );


        if (track) {

            track.setAttribute(
                "aria-valuenow",
                String(Math.round(value))
            );

        }

    },


    /* ------------------------------------------------------------
       HIDE PROGRESS

       Hides the progress bar when there is no meaningful progress
       information.
       ------------------------------------------------------------ */

    hideProgress() {

        if (!this.progressContainer) {

            return;

        }


        this.progressContainer.hidden =
            true;

    },


    /* ------------------------------------------------------------
       FINISH

       Removes the loading screen.

       A short fade is used when movement is allowed.

       If reduced motion is enabled, it disappears immediately.
       ------------------------------------------------------------ */

    finish() {

        if (!this.screen) {

            return;

        }


        this.stopDots();


        const reducedMotion =
            window.matchMedia &&
            window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            ).matches;


        if (reducedMotion) {

            this.screen.remove();

            return;

        }


        this.screen.classList.add(
            "loading-screen-finished"
        );


        window.setTimeout(
            () => {

                if (this.screen) {

                    this.screen.remove();

                }

            },

            180

        );

    },


    /* ------------------------------------------------------------
       RESET

       Restores the loading screen to its initial state.

       Useful if the same loader is reused for multiple loading
       operations.
       ------------------------------------------------------------ */

    reset() {

        this.dotIndex = 0;

        this.updateDots();

        this.setDestination(
            "Loading"
        );

        this.hideProgress();

    }

};


/* ================================================================
   FINISH ANIMATION

   This class is intentionally added here rather than directly
   changing the CSS file's base loading-screen appearance.

   The loader remains fully opaque until finish() is called.
   ================================================================ */

const loadingFinishStyle =
    document.createElement("style");

loadingFinishStyle.textContent = `

    .loading-screen {

        opacity: 1;

        transition:
            opacity
            0.18s
            ease;

    }


    .loading-screen-finished {

        opacity: 0;

        pointer-events: none;

    }

`;


document.head.appendChild(
    loadingFinishStyle
);


/* ================================================================
   INITIALIZE
   ================================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            LoadingScreen.init();

        },
        {
            once: true
        }
    );

} else {

    LoadingScreen.init();

}


/* ================================================================
   GLOBAL ACCESS

   Makes the loading system available to other Card Stuff Yes
   scripts.

   Other pages can then use:

       LoadingScreen.setDestination("Loading homepage");

       LoadingScreen.setProgress(50);

       LoadingScreen.finish();
   ================================================================ */

window.LoadingScreen =
    LoadingScreen;
```
