/* ============================================================
CARD STUFF YES — GLOBAL LOADING SCREEN
============================================================ */

const LoadingScreen = {

screen: null,
dots: null,
progressContainer: null,
progress: null,
progressText: null,
destination: null,

dotFrames: [
    "",
    ".",
    "..",
    "..."
],

dotIndex: 0,
dotTimer: null,

init: function () {

    this.screen =
        document.getElementById("loading-screen");

    this.dots =
        document.getElementById("loading-dots");

    this.progressContainer =
        document.getElementById("loading-progress-container");

    this.progress =
        document.getElementById("loading-progress");

    this.progressText =
        document.getElementById("loading-progress-text");

    this.destination =
        document.getElementById("loading-destination");

    if (!this.screen) {
        return;
    }

    this.startDots();
},

startDots: function () {

    if (!this.dots) {
        return;
    }

    this.dotIndex = 0;
    this.updateDots();

    this.dotTimer = window.setInterval(
        function () {

            this.dotIndex++;

            if (
                this.dotIndex >=
                this.dotFrames.length
            ) {
                this.dotIndex = 0;
            }

            this.updateDots();

        }.bind(this),
        350
    );
},

updateDots: function () {

    if (!this.dots) {
        return;
    }

    this.dots.textContent =
        this.dotFrames[this.dotIndex];
},

stopDots: function () {

    if (this.dotTimer !== null) {

        window.clearInterval(
            this.dotTimer
        );

        this.dotTimer = null;
    }
},

setDestination: function (text) {

    if (!this.destination) {
        return;
    }

    this.destination.textContent =
        String(
            text === null || text === undefined
                ? "Loading"
                : text
        );
},

setProgress: function (percent) {

    if (
        !this.progressContainer ||
        !this.progress
    ) {
        return;
    }

    var value = Number(percent);

    if (!Number.isFinite(value)) {
        return;
    }

    value = Math.max(
        0,
        Math.min(100, value)
    );

    this.progressContainer.hidden = false;

    this.progress.style.width =
        String(value) + "%";

    if (this.progressText) {

        this.progressText.textContent =
            String(Math.round(value)) + "%";
    }

    var track =
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

hideProgress: function () {

    if (!this.progressContainer) {
        return;
    }

    this.progressContainer.hidden = true;
},

finish: function () {

    if (!this.screen) {
        return;
    }

    this.stopDots();

    var reducedMotion =
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
        function () {

            if (this.screen) {
                this.screen.remove();
            }

        }.bind(this),
        180
    );
},

reset: function () {

    this.dotIndex = 0;

    this.updateDots();

    this.setDestination(
        "Loading"
    );

    this.hideProgress();
}

};

/* ============================================================
LOADING SCREEN FINISH CSS
============================================================ */

var loadingFinishStyle =
document.createElement("style");

loadingFinishStyle.textContent =

".loading-screen {" +
    "opacity: 1;" +
    "transition: opacity 0.18s ease;" +
"}" +

".loading-screen-finished {" +
    "opacity: 0;" +
    "pointer-events: none;" +
"}";

document.head.appendChild(
loadingFinishStyle
);

/* ============================================================
INITIALIZE
============================================================ */

function initializeLoadingScreen() {

LoadingScreen.init();

}

if (
document.readyState ===
"loading"
) {

document.addEventListener(
    "DOMContentLoaded",
    initializeLoadingScreen,
    {
        once: true
    }
);

} else {

initializeLoadingScreen();

}

/* ============================================================
GLOBAL ACCESS
============================================================ */

window.LoadingScreen =
LoadingScreen;
