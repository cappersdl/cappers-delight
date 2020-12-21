const { app, shell, BrowserWindow, BrowserView, Menu, MenuItem, session } = require('electron');
const { ipcMain, dialog } = require('electron')
const Store = require('electron-store');
const Video = require('./video');
const fs = require('fs');
const contextMenu = require('electron-context-menu');
const { SSL_OP_NO_TLSv1_1 } = require('constants');

const debug = true;

var prevURL = null;

if (debug) {
    contextMenu({
        prepend: (params, browserWindow) => [{
            label: 'Rainbow',
            // Only show it when right-clicking images
            visible: params.mediaType === 'image'
        }]
    });
}

app.whenReady().then(createWindow);
app.on("before-quit", (e) => {
    //e.preventDefault();
    if (Video.isDownloading) {
        dialog.showMessageBox(null, {
            type: "warning",
            title: "Really quit?",
            message: "You may have some files in progress. Do you really want to quit the application?",
            buttons: ["NO", "Yes"],
            defaultId: 0,
            cancelId: 0
        }).then((result) => {
            if (result.response == 0) e.preventDefault();
        });
    }
});

function browserGo(url) {
    url = url.toLowerCase();
    url = (url.indexOf("http://") == 0 || url.indexOf("https://") == 0) ? url : "http://" + url;
    app.browser.webContents.loadURL(url);
}

// set up persisted storage
app.store = new Store();
// all persisted settings
app.settings = {
    get savepath() {
        let temp_savepath = app.store.get("savepath");
        temp_savepath = (temp_savepath) ? temp_savepath : app.getAppPath();
        return temp_savepath;
    },
    set savepath(p) {
        if (p) {
            p = p.toString().endsWith("/") ? `${p}` : `${p} /`;
            app.store.set("savepath", p);
            app.emitSettings();
        }
    },
    get bookmarks() {
        // return [];
        let temp_bms = app.store.get("bookmarks");
        temp_bms = (temp_bms) ? temp_bms : [
            { title: "Google", url: "http://google.com" }
        ];
        return temp_bms;
    },
    get openinscreener() {
        let temp_ois = app.store.get("openinscreener");
        temp_ois = (temp_ois) ? true : false;
        return temp_ois;
    },
    set openinscreener(v) {
        app.store.set("openinscreener", (v) ? true : false);
        app.emitSettings();
    },
    addBookmark: (title, url) => {
        let bms = app.settings.bookmarks;
        if (!title || title == "") title = url.replace("https://", "").replace("http://", "");
        bms.splice(0, 0, { title: title, url: url });
        app.store.set("bookmarks", bms);
        app.emitSettings();
    },
    removeBookmark: (idx) => {
        let bms = app.settings.bookmarks;
        if ((idx || idx >= 0) && idx < bms.length) {
            bms.splice(idx, 1);
        }
        app.store.set("bookmarks", bms);
        app.emitSettings();
    },
    clearBookmarks: () => {
        app.store.set("bookmarks", []);
        app.emitSettings();
    }
}

/***************************************
*  utility functions
****************************************/
app.genguid = function () {
    let _sym = 'abcdefghijklmnopqrstuvwxyz1234567890';
    let str = '';
    let len = 32;
    str += _sym[parseInt(Math.random() * (_sym.length - 10))];
    for (var i = 0; i < len - 1; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length))];
    }
    return str;
}
app.emitSettings = function () {
    let settings = {
        savepath: app.settings.savepath,
        sizes: appSizes,
        bookmarks: app.settings.bookmarks,
        openinscreener: app.settings.openinscreener
    }
    console.log(settings);
    app.win.webContents.send("send-settings", settings);
}
// app.loadSourceURL = function (bv) {
//     //console.log("loadSourceURL");
//     s = (s.toString().indexOf("http://") < 0 && s.toString().indexOf("https://") < 0) ? `http://${s}` : s;
//     console.log(s.toString().indexOf("http://"));
//     bv.webContents.loadURL(s);
// }

/***************************************
*  HANDLE app events
****************************************/
app.on('before-quit', () => {
    console.log("before-quit...");
    Video.removeAll();
})
app.on('window-all-closed', () => {
    console.log("window-all-closed...");
    app.quit();
})
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
})

/***************************************
*  HANDLE calls from client script
****************************************/
// window resizing
ipcMain.handle('resize-win', async (event, wid) => {
    let wb = app.win.getBounds();
    let sb = (app.savedScreenBounds) ? app.savedScreenBounds : app.browserScreener.getBounds();
    app.browser.setBounds({ x: wid + 5, y: 40, width: wb.width - wid, height: wb.height - 40 });
    let nsb = { x: 0, y: sb.y, width: wid, height: sb.height };
    if (app.savedScreenBounds) {
        app.savedScreenBounds = nsb;
    } else {
        app.browserScreener.setBounds(nsb);
    }
})
ipcMain.handle('resize-screen', async (event, ht) => {
    let contentSize = app.win.getContentSize();
    let sb = (app.savedScreenBounds) ? app.savedScreenBounds : app.browserScreener.getBounds();
    let nsb = { x: 0, y: contentSize[1] - ht, width: sb.width, height: ht - 5 };
    if (app.savedScreenBounds) {
        app.savedScreenBounds = nsb;
    } else {
        app.browserScreener.setBounds(nsb);
    }
})
// change save path - open dialog for save path
ipcMain.on('select-dirs', async (event, arg) => {
    let result = await dialog.showOpenDialog(this.win, { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        app.settings.savepath = result.filePaths[0];
    }
})
// initiate download
ipcMain.handle('dl', async (event, url) => {
    console.log(url);
    if (url && url != '') Video.add(url);
})
// load settings from client
ipcMain.handle("get-settings", async (event) => {
    console.log("main: get-settings")
    app.emitSettings();
});
ipcMain.handle("do-pop", async (event, url) => {
    console.log("in do-pop: " + url);
    handleBrowserPop(event, url, null, true);
});
ipcMain.handle("browser-nav", async (event, dir) => {
    prevURL = null;
    if (dir === 'back' && app.browser.webContents.canGoBack()) {
        app.browser.webContents.goBack();
    }
    if (dir === 'forward' && app.browser.webContents.canGoForward()) {
        app.browser.webContents.goForward();
    }
    if (dir === 'reload') {
        app.browser.webContents.reload();
    }
});
ipcMain.handle("cancel-dl", async (event, id) => {
    console.log("cancel: " + id);
    Video.abort(id);
});
ipcMain.handle("delete-file", async (event, id) => {
    console.log("delete: " + id);
    Video.delete(id);
    Video.remove(id);
});
ipcMain.handle("open-file", async (event, id) => {
    console.log("open: " + id);
    Video.play(id);
});
ipcMain.handle("bookmark-add", async (event, title, url) => {
    app.settings.addBookmark(title, url);
    app.emitSettings();
});
ipcMain.handle("bookmark-del", async (event, idx) => {
    app.settings.removeBookmark(idx);
    app.emitSettings();
});
ipcMain.handle("browser-go", async (event, url, ignoreHist) => {
    browserGo(url);
    //if (!ignoreHist) logEvent("suggest-url", url, "browser-go");
});
ipcMain.handle("screener-toggle", async (event, state) => {
    if (state) {
        app.browserScreener.setBounds(app.savedScreenBounds);
        app.savedScreenBounds = null;
    } else {
        app.savedScreenBounds = app.browserScreener.getBounds();
        app.browserScreener.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
});
ipcMain.handle("screener-unload", async (event, state) => {
    unloadScreener();
});
ipcMain.handle("screener-pop", async (event, state) => {
    let url = app.browserScreener.webContents.getURL();
    handleBrowserPop(event, url, null, false);
    unloadScreener();
});
ipcMain.handle("set-screenf", async (event, ck) => {
    app.settings.openinscreener = ck;
    unloadScreener();
});
/*****************************************
*  Create app windows and wire up events
******************************************/
let appSizes = {
    width: 1600,
    height: 800,
    left: 400,
    right: 1195,
    leftMin: 300,
    rightMin: 400,
    screenMin: 200,
    screenMax: 600
}
function logEvent(event, url, src, incHist) {
    console.log(`>>>>> ${src} <<<<<`);
    console.log(`----- ${url} -----`);
    console.log(event);
    app.win.webContents.send("suggest-url", url, src, incHist);
}
function unloadScreener() {
    app.browserScreener.webContents.loadFile("layouts/screener_default.html");
}
function createWindow() {
    const browserSession = session.fromPartition('persist:browser')

    // TODO: persist current window sizes
    let win = new BrowserWindow({
        width: appSizes.width,
        height: appSizes.height,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        webPreferences: {
            nodeIntegration: true
        }
    });
    app.win = win;
    win.loadFile('index.html')
    // win.webContents.openDevTools({ mode: "detach" });

    // handle window resize and notify web script for resizing panes
    app.win.on("resize", (event) => {
        let wb = app.win.getBounds();
        let bb = app.browser.getBounds();
        let bsb = (app.savedScreenBounds) ? app.savedScreenBounds : app.browserScreener.getBounds();
        let newbounds = {
            x: bb.x,
            y: 40,
            width: wb.width - bb.x - 5,
            height: wb.height - 40
        };
        let bBounds = { x: newbounds.x, y: newbounds.y, width: newbounds.width, height: newbounds.height };
        app.browser.setBounds(bBounds);

        let contentSize = app.win.getContentSize();
        let nsb = { x: 0, y: contentSize[1] - bsb.height, width: bsb.width, height: bsb.height };
        if (app.savedScreenBounds) {
            app.savedScreenBounds = nsb;
        } else {
            app.browserScreener.setBounds(nsb);
        }
    });

    // create source website browser window
    let browserOpts = { width: false, height: false };
    let browserBounds = { x: appSizes.left + 5, y: 40, width: appSizes.right - 5, height: appSizes.height - 40 };

    app.browser = new BrowserView({ webPreferences: { session: browserSession } });
    app.browserScreener = new BrowserView({ webPreferences: { session: browserSession } });
    //app.browserLive = new BrowserView({ webPreferences: { session: browserSession } });
    app.browserCtx = new Menu();
    app.browserCtx.append(new MenuItem({
        label: "Open in Screener",
        click: (event) => {
            let link = app.ctxParams.linkURL;
            handleBrowserPop(event, link, null, true);
        }
    }));
    app.ctxParams = null;

    app.browser.setAutoResize(browserOpts);
    app.browserScreener.setAutoResize(browserOpts);

    win.addBrowserView(app.browser);
    win.addBrowserView(app.browserScreener);

    app.browser.setBounds(browserBounds);
    let contentSize = app.win.getContentSize();
    app.browserScreener.setBounds({ x: 0, y: contentSize[1] - 350, width: appSizes.left, height: 350 });

    unloadScreener();

    app.browser.webContents.on('will-navigate', (event, url) => {
        //logEvent("suggest-url", url, 'will-navigate');
        //console.log("will-navigate:" + url);
    });
    app.browser.webContents.on('will-redirect', (event, url) => {
        //console.log("will-redirect:" + url);
        //logEvent("suggest-url", url, 'will-redirect');
    });
    app.browser.webContents.on('did-navigate', (event, url) => {
        //console.log("did-navigate-in-page:" + url);
        //let incHist = (prevURL && prevURL != url);
        //prevURL = url;
        logEvent("suggest-url", url, 'did-navigate', false);
    });
    app.browser.webContents.on('did-navigate-in-page', (event, url) => {
        //console.log("did-navigate-in-page:" + url);
        let incHist = (prevURL && prevURL != url);
        prevURL = url;
        logEvent("suggest-url", url, 'did-navigate-in-page', incHist);
    });

    app.browser.webContents.on('context-menu', (event, params) => {
        if (params.linkURL && params.linkURL.trim() != "") {
            app.ctxParams = params;
            app.browserCtx.popup(app.browser, params.x, params.y);
        }
    });
    app.browser.webContents.on('new-window', (event, url, frameName, disposition, options, additionalFeatures, referrer, postBody) => {
        event.preventDefault();
        handleBrowserPop(event, url, null, true);
    });

    if (app.settings.bookmarks && app.settings.bookmarks.length > 0) {
        let bm = app.settings.bookmarks[0];
        browserGo(bm.url);
    }
}

function handleBrowserPop(event, url, options, useScreener) {
    if (event && event.preventDefault) {
        event.preventDefault();
    }
    logEvent("suggest-url", url, 'new-window-url');
    if (useScreener) {
        app.browserScreener.webContents.loadURL(url);
    }
    else {
        if (!app.pop) {
            app.pop = new BrowserWindow({
                webContents: (options) ? options.webContents : null, // use existing webContents if provided
                show: false,
                plugins: true,
            })
            app.pop.once('ready-to-show', () => app.pop.show())
            app.pop.on('close', (event) => {
                app.pop = null;
            });

            app.pop.webContents.on('will-navigate', (event, url) => {
                logEvent("suggest-url", url, 'will-navigate');
            });
            app.pop.webContents.on('did-start-navigation', (event, url) => {
                logEvent("suggest-url", url, 'did-start-navigation');
            });
            app.pop.webContents.on('did-navigate', (event, url) => {
                logEvent("suggest-url", url, 'did-navigate');
            });
            app.pop.webContents.on('did-navigate-in-page', (event, url) => {
                logEvent("suggest-url", url, 'did-navigate-in-page');
            });
            app.pop.webContents.on('will-redirect', (event, url) => {
                logEvent("suggest-url", url, 'will-redirect');
            });
            app.pop.webContents.on('did-redirect-navigation', (event, url) => {
                logEvent("suggest-url", url, 'did-redirect-navigation');
            });
            event.newGuest = app.pop;
        }
        app.pop.loadURL(url) // existing webContents will be navigated automatically
        app.pop.focus();
    }
}
