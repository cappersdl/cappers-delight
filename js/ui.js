const utils = require("./js/utils.js");
const { ipcRenderer, shell, ipcMain, app } = require("electron");

window.ipcRenderer = require("electron").ipcRenderer;

window.ui = {
    browserHistLen: 0,
    browserHistPos: 0,
    settings_visible: false,
    screener_visible: true,
    resizingv: false,
    resizingh: false,
    settingsLoaded: false,
    incrementHistory: () => {
        ui.browserHistLen++;
        ui.browserHistPos++;
        ui.calcHistory();
    },
    openBrowserTo: (url, ignoreHist) => {
        if (url && url.trim() != "") {
            ipcRenderer.invoke('browser-go', url, ignoreHist);
            if (!ignoreHist) {
                ui.incrementHistory();
            }
        }
    },
    addDl: (info) => {
        let thumb = (info.thumbnail) ? info.thumbnail : "img/default_thumb.png";
        let itm = document.getElementById(info.id);
        if (itm) {
            itm.setAttribute("id", info.id);
            itm.setAttribute("data-file", info.filename);
            let elTitle = itm.querySelector(".title a");
            if (elTitle) { elTitle.innerHTML = info.title }
            itm.setAttribute("class", "dl-item " + info.status);

            let elThumb = itm.querySelector(".thumb-wrap img");
            if (elThumb) {
                elThumb.setAttribute("src", thumb);
            }
            if (info.status == "complete" || info.status == "error" || info.status == "closed" || info.status == "aborted") {
                ui.dlist.appendChild(itm);
            }
        }
        else {
            itm = document.createElement("DIV");
            itm.setAttribute("id", info.id);
            itm.setAttribute("data-file", info.filename);
            itm.setAttribute("class", "dl-item starting");
            let title = (info.title) ? info.title : " - pending - "
            itm.innerHTML = `<div class="thumb-wrap"><a class="pop_img" href="${info.o_url}"><img src="${thumb}" class="thumb"></a></div>
            <div class="info-wrap">
                <div class="info title"><a class="pop" href="${info.o_url}">${title}</a></div>
                <div class="info controls">
                    <i class='fa fa-square btn-cancel'></i>
                    <i class='fa fa-eye btn-open'></i>
                    <i class='fa fa-times-circle btn-clear'></i>
                    <i class='fa fa-trash btn-delete'></i>
                </div>
            </div><i class="fas fa-spinner fa-pulse spinner"></i>`;
            ui.dlist.prepend(itm);
            // load current into popup
            document.querySelector(`#${info.id} .info-wrap a.pop`).addEventListener('click', ui.handlePop);
            document.querySelector(`#${info.id} .thumb-wrap a.pop_img`).addEventListener('click', ui.handlePop);
            let tid = info.id;
            //let thisItm = itm;
            document.querySelector(`#${info.id} .btn-cancel`).addEventListener('click', (e) => {
                ipcRenderer.invoke('cancel-dl', tid);
            });
            document.querySelector(`#${info.id} .btn-open`).addEventListener('click', (e) => {
                ipcRenderer.invoke('open-file', tid);
            });
            document.querySelector(`#${info.id} .btn-clear`).addEventListener('click', (e) => {
                itm.style.display = "none";
            });
            document.querySelector(`#${info.id} .btn-delete`).addEventListener('click', (e) => {
                ipcRenderer.invoke('delete-file', tid);
                itm.style.display = "none";
            });
        }
    },
    handlePop: (e) => {
        e.preventDefault();
        var el = e.srcElement;
        while (el.tagName != "A") {
            el = el.parentElement;
            if (!el || el.tagName == "BODY") return;
        }
        if (el.attributes.href) {
            var lnk = el.attributes.href.textContent;
            if (lnk != "") {
                ipcRenderer.invoke('do-pop', lnk);
            }
        }
    },
    setBookmarks: (nbms) => {
        var bmlen = ui.bms.children.length;
        while (ui.bms.children.length > 0) {
            ui.bms.remove(0);
        }
        for (var i = 0; i < nbms.length; i++) {
            var b = nbms[i];
            var option = document.createElement("option");
            option.text = b.title;
            option.value = b.url;
            ui.bms.add(option);
        }
    },
    applySettings: () => {
        let spl = document.querySelector("#save-path-label");
        if (spl) { spl.value = ui.settings.savepath; }
        ui.setBookmarks(ui.settings.bookmarks);
    },
    calcHistory: () => {
        if (ui.bb.classList.contains("disabled")) ui.bb.classList.remove("disabled");
        if (ui.bf.classList.contains("disabled")) ui.bf.classList.remove("disabled");
        if (ui.browserHistPos == ui.browserHistLen) ui.bf.classList.add("disabled");
        if (ui.browserHistPos == 0) ui.bb.classList.add("disabled");
    },
    resizeV: (e) => {
        var px = (e) ? e.pageX : 400;
        var wid = (px + 2);
        let lMin = ui.settings.sizes.leftMin;
        let rMin = window.innerWidth - 2 - ui.settings.sizes.rightMin;
        if (wid < lMin) wid = lMin;
        if (wid > rMin) wid = rMin;
        ui.appWrapper.style.width = `${wid}px`;
        ipcRenderer.invoke('resize-win', wid);
    },
    resizeList: () => {
        var padTop = (ui.ublock.offsetHeight + ui.setblock.offsetHeight + 16);
        var ht = ui.screenBase.offsetHeight;
        var listh = window.innerHeight - ht - padTop;
        ui.dlist.style.height = `${listh}px`;
    },
    resizeH: (e) => {
        var py = (e) ? e.pageY : window.innerHeight - ui.screenBase.offsetHeight;
        var ht = window.innerHeight - py;
        if (ht < ui.settings.sizes.screenMin) ht = ui.settings.sizes.screenMin;
        if (ht > window.innerHeight - 200) ht = window.innerHeight - 200;
        ui.screenBase.style.height = `${ht}px`;
        ui.resizeList();
        ipcRenderer.invoke('resize-screen', ht);
    },
    historyNav: (dir) => {
        ui.browserHistPos += dir;
        ui.calcHistory();
        let sDir = (dir == 1) ? "forward" : "back";
        ipcRenderer.invoke('browser-nav', sDir);
    },
    startCapture: () => {
        var url = ui.vidurl.value;
        ui.vidurl.value = "";
        ipcRenderer.invoke('dl', url).then((result) => {
            //console.log(result);
        });
    },
    bindElements: () => {
        ui.bb = document.getElementById('btn-back');
        ui.bb.addEventListener('click', (e) => {
            e.preventDefault();
            if (ui.bb.classList.contains("disabled")) return;
            ui.historyNav(-1);
        });

        ui.bf = document.getElementById('btn-forward');
        ui.bf.addEventListener('click', (e) => {
            e.preventDefault();
            if (ui.bf.classList.contains("disabled")) return;
            ui.historyNav(1);
        });

        ui.bm = document.getElementById('btn-bookmark');
        ui.bm.addEventListener('click', (e) => {
            e.preventDefault();
            let uval = ui.burl.value;
            if (uval.trim() == "") return;
            ipcRenderer.invoke('bookmark-add', null, uval);
        });

        ui.burl = document.getElementById('browser-url');
        ui.burl.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
                ui.openBrowserTo(ui.burl.value);
            }
        });

        ui.bmd = document.querySelector("#bookmark-delete");
        ui.bmd.addEventListener('click', (e) => {
            e.preventDefault();
            let url = ui.bms.value;
            for (var i = 0; i < ui.bms.children.length; i++) {
                var opt = ui.bms.children[i];
                if (opt.value == url) {
                    ipcRenderer.invoke('bookmark-del', i);
                    break;
                }
            }
        });

        ui.btnreload = document.getElementById('btn-reload');
        ui.btnreload.addEventListener('click', (e) => { e.preventDefault(); ipcRenderer.invoke('browser-nav', 'reload'); });

        ui.savepath = document.getElementById('save-path');
        ui.savepath.addEventListener('click', () => { ipcRenderer.send('select-dirs') });

        ui.bgo = document.getElementById('browser-go');
        ui.bgo.addEventListener("click", (e) => {
            e.preventDefault();
            ui.openBrowserTo(ui.bms.value);
        });

        ui.btnsettings = document.querySelector('#settings-button-wrap i.fa-cogs');
        ui.btnsettings.addEventListener('click', (e) => {
            ui.settings_visible = !ui.settings_visible;
            var vis = (ui.settings_visible) ? "" : "none";
            ui.setblock.style.display = vis;
            ui.resizeH();
        });

        ui.btnaddvid = document.getElementById("add-vid-url");
        ui.btnaddvid.addEventListener("click", function (e) {
            e.preventDefault();
            ui.startCapture();
        });
        ui.vidurl = document.getElementById("vid-url");
        ui.vidurl.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
                ui.startCapture();
            }
        });

        ui.splitterv = document.querySelector(".splitter.vert");
        ui.splitterv.addEventListener('mousedown', function (e) { ui.resizingv = true; });

        ui.splitterh = document.querySelector(".splitter.horiz");
        ui.splitterh.addEventListener('mousedown', function (e) { ui.resizingh = true; });

        ui.scrtog = document.querySelector("#screener-controls i.toggle")
        ui.scrtog.addEventListener("click", (e) => {
            e.preventDefault();
            ui.screener_visible = !ui.screener_visible;
            ui.screenBase.style.display = (!ui.screener_visible) ? "none" : "";
            ui.splitterh.style.display = (!ui.screener_visible) ? "none" : "";
            ipcRenderer.invoke("screener-toggle", ui.screener_visible);
            ui.resizeH();
        });

        ui.scrunload = document.querySelector("#screener-controls i.unload")
        ui.scrunload.addEventListener("click", (e) => { ipcRenderer.invoke("screener-unload"); });

        ui.scrpop = document.querySelector("#screener-controls i.popout")
        ui.scrpop.addEventListener("click", (e) => { ipcRenderer.invoke("screener-pop"); });

        // ui.screenf = document.getElementById("force-screen");
        // ui.screenf.addEventListener('click', (e) => { ipcRenderer.invoke("set-screenf", ui.screenf.checked); });

        ui.appWrapper = document.getElementById("app-wrapper");
        ui.screenBase = document.getElementById("screen-base");
        ui.ublock = document.getElementById("url-wrap");
        ui.setblock = document.getElementById("settings");
        ui.dlist = document.getElementById("dl-list");
        ui.bms = document.querySelector("select#bookmarks");

        // global handlers
        window.addEventListener('resize', (e) => { ui.resizeList(); });
        document.addEventListener('mouseup', function (e) { ui.resizingh = ui.resizingv = false; });
        document.addEventListener('mousemove', (e) => {
            if (ui.resizingv) { ui.resizeV(e); }
            if (ui.resizingh) { ui.resizeH(e); }
        });
    }
}


utils.ready(() => {
    // browser nav
    ui.bindElements();

    // initialize persisted settings
    ipcRenderer.invoke('get-settings').then(() => {
        // open to first bookmark on initial load
        ui.bms.addEventListener('change', (e) => {
            ui.openBrowserTo(ui.bms.value, true);
        });
    });
});


// Inbound message handlers from app
ipcRenderer.on('dl-info', (event, info) => {
    if (info) { ui.addDl(info); }
});
ipcRenderer.on('dl-data', (event, data) => {
    var stat = document.querySelector("#dl-list #vid_" + data.id + " div.info.status");
    if (stat) stat.innerHTML = data;
});
ipcRenderer.on('dl-err', (event, data) => {
    // console.log(data.err);
});
ipcRenderer.on('win-resized', (event, bounds) => {
    ui.appWrapper.style.width = `${bounds.x}px`;
    ui.resizeList();
});
ipcRenderer.on('suggest-url', (event, url, src, incHist) => {
    if (url == "about:blank") return;
    //console.log(`${src} : ${url}`);
    ui.vidurl.value = url;
    ui.burl.value = url;
    if (incHist === true) {
        ui.incrementHistory();
    }
});
ipcRenderer.on('send-settings', (event, settings) => {
    ui.settings = settings;
    ui.applySettings();
    ui.resizeH();

    if (!ui.settingsLoaded) {
        ui.settingsLoaded = true;
        ui.appWrapper.style.width = `${settings.sizes.left}px`;
    }
});