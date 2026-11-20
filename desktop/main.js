"use strict";
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const { parseAppUrl, shouldOpenExternally, shouldAllowNavigation } = require("./url-policy");

const DEFAULT_APP_URL = "https://cardstuffyes.ca/";
const configuredUrl = process.env.CSY_DESKTOP_URL || DEFAULT_APP_URL;
let mainWindow = null;

// Keep one application process per user session and focus its existing window.
const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) app.quit();

function openExternalSafely(target, appUrl) {
    if (!shouldOpenExternally(target, appUrl)) return;
    shell.openExternal(target).catch(error => {
        console.warn("Could not open external link:", error.message);
    });
}

let loadErrorPromptOpen = false;

async function handleLoadFailure(error) {
    if (loadErrorPromptOpen || !mainWindow || mainWindow.isDestroyed()) return;
    loadErrorPromptOpen = true;
    try {
        const result = await dialog.showMessageBox(mainWindow, {
            type: "warning",
            title: "Card Stuff Yes — connection problem",
            message: "Card Stuff Yes could not reach the configured server.",
            detail: String(error.message || "Check your internet connection and server URL.") +
                "\n\nThe desktop client needs a network connection; offline play is not available yet.",
            buttons: ["Retry", "Quit"],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });
        if (result.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(parseAppUrl(configuredUrl).toString()).catch(nextError => {
                handleLoadFailure(nextError);
            });
        } else {
            app.quit();
        }
    } finally {
        loadErrorPromptOpen = false;
    }
}

function createWindow() {
    const appUrl = parseAppUrl(configuredUrl);
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 620,
        show: false,
        backgroundColor: "#080810",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });

    mainWindow.once("ready-to-show", () => mainWindow?.show());
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        openExternalSafely(url, appUrl);
        return { action: "deny" };
    });

    const guardNavigation = (event, target) => {
        if (shouldAllowNavigation(target, appUrl)) return;
        event.preventDefault();
        openExternalSafely(target, appUrl);
    };
    mainWindow.webContents.on("will-navigate", guardNavigation);
    mainWindow.webContents.on("will-redirect", guardNavigation);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
        if (isMainFrame && errorCode !== -3) {
            handleLoadFailure(new Error(errorDescription + " (" + errorCode + ")"));
        }
    });
    mainWindow.loadURL(appUrl.toString()).catch(error => {
        console.error("Card Stuff Yes could not load:", error.message);
        handleLoadFailure(error);
    });
}

if (hasSingleInstance) {
    app.on("second-instance", () => {
        if (!mainWindow) {
            createWindow();
            return;
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady().then(() => {
        createWindow();
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    }).catch(error => {
        console.error("Card Stuff Yes desktop startup failed:", error.message);
        app.quit();
    });
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
