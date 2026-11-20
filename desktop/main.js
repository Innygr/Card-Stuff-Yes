"use strict";
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const DEFAULT_APP_URL = "https://cardstuffyes.ca/";
const configuredUrl = process.env.CSY_DESKTOP_URL || DEFAULT_APP_URL;

function getAppUrl() {
    const url = new URL(configuredUrl);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) throw new Error("CSY_DESKTOP_URL must use HTTPS (HTTP only for localhost).");
    if (url.username || url.password) throw new Error("CSY_DESKTOP_URL must not contain credentials.");
    return url;
}

function createWindow() {
    const appUrl = getAppUrl();
    const window = new BrowserWindow({
        width: 1280, height: 820, minWidth: 900, minHeight: 620,
        show: false, backgroundColor: "#080810", autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
        }
    });
    window.once("ready-to-show", () => window.show());
    window.webContents.setWindowOpenHandler(({ url }) => {
        const target = new URL(url);
        if (target.protocol === "https:") shell.openExternal(target.toString());
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, target) => {
        const next = new URL(target);
        const localHttp = next.protocol === "http:" && ["localhost", "127.0.0.1"].includes(next.hostname);
        if (next.origin !== appUrl.origin && !(localHttp && appUrl.hostname === "localhost")) {
            event.preventDefault();
            if (next.protocol === "https:") shell.openExternal(next.toString());
        }
    });
    window.loadURL(appUrl.toString());
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => {
    console.error("Card Stuff Yes desktop startup failed:", error.message);
    app.quit();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
