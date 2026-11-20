"use strict";
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { parseAppUrl, shouldOpenExternally, shouldAllowNavigation } = require("./url-policy");

const DEFAULT_APP_URL = "https://cardstuffyes.ca/";
const configuredUrl = process.env.CSY_DESKTOP_URL || DEFAULT_APP_URL;

function createWindow() {
    const appUrl = parseAppUrl(configuredUrl);
    const window = new BrowserWindow({
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

    window.once("ready-to-show", () => window.show());
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (shouldOpenExternally(url, appUrl)) shell.openExternal(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, target) => {
        if (!shouldAllowNavigation(target, appUrl)) {
            event.preventDefault();
            if (shouldOpenExternally(target, appUrl)) shell.openExternal(target);
        }
    });
    window.loadURL(appUrl.toString());
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}).catch(error => {
    console.error("Card Stuff Yes desktop startup failed:", error.message);
    app.quit();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
