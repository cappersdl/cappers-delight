const { app, shell, ipcMain, webContents } = require('electron');
const fs = require('fs');
const ydl = require('youtube-dl');
const { spawn, exec } = require('child_process');
const got = require('got');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

class Video {
    static list = [];
    constructor(url) {
        this.info = {
            id: app.genguid(),
            o_url: url,
            url: url,
            status: "new",
            error: null,
            title: null,
            filename: null
        }
        this.stream = null;
        this.altUrl();
        this.downloadVideo();
    }
    static add(url) {
        let v = new Video(url);
        Video.list.push(v);
        return v;
    }
    static abort(id) {
        let v = Video.get(id);
        if (v) {
            v.abortDownload();
        }
    }
    static remove(id) {
        for (let i = 0; i < Video.list.length; i++) {
            let v = Video.list[i];
            if (v.info.id == id) {
                Video.list.splice(i, 1);
                break;
            }
        }
    }
    static removeAll() {
        for (let i = 0; i < Video.list.length; i++) {
            Video.list[i].abortDownload();
        }
        Video.list = [];
    }
    static play(id) {
        let v = Video.get(id);
        if (!v) return;
        let opener = "";
        switch (process.platform) {
            case 'darwin': opener = 'open'; break;
            case 'win32':
            case 'win64': opener = 'start'; break;
            default: opener = 'xdg-open';
        }
        let fn = v.info.filename;//.substr(0, v.info.filename.length - 4);
        //fn = fn.replace(/(["\s'$`\\.#])/g, '\\$1') + ".mp4";
        fn = fn.replace(/(["\s'$`\\.#!$&'()*,;<=>?\[\]{}`^|~])/g, '\\$1') + ".mp4";
        console.log(`OPENING: ${fn}`);
        exec("open " + fn, { cwd: app.settings.savepath });
    }
    static delete(id) {
        //let fn = v.info.filename.replace(/(["\s'$`\\])/g, '\\$1');
        let v = Video.get(id);
        if (!v) return;
        let fn = (v.info.filename.endsWith(".mp4")) ? v.info.filename : v.info.filename + ".mp4";
        let filepath = app.settings.savepath + fn;

        if (fs.existsSync(filepath)) {
            fs.unlink(filepath, (err) => {
                if (err) {
                    alert("An error ocurred updating the file" + err.message);
                    console.log(err);
                    return;
                }
                console.log("File succesfully deleted");
            });
        } else {
            alert("This file doesn't exist, cannot delete");
        }
    }
    static get isDownloading() {
        var cnt = 0;
        for (var i = 0; i < Video.list.length; i++) {
            var v = Video.list[i];
            if (v.active) cnt++;
        }
        if (cnt > 0) return true;
        return false;
    }
    static get(id) {
        for (let i = 0; i < Video.list.length; i++) {
            let v = Video.list[i];
            if (v.info.id == id) {
                return v;
            }
        }
        return null;
    }
    static emit(event, data) {
        try {
            app.win.webContents.send(event, data);
        } catch (error) {
            // ignore
        }
    }
    get active() {
        return (this.info.status == "starting" || this.info.status == "downloading");
    }
    abortDownload() {
        console.log("abortDownload")
        if (!this.stream) return;
        try {
            this.info.status = "aborted";
            Video.emit('dl-info', this.info);
            this.stream.stdin.pause();
            console.log("killing: " + this.stream.pid);
            process.kill(-this.stream.pid);
            //this.stream.kill();
        } catch (error) {
            // ignore errors in killing the process
            console.log(error);
        }
        delete this.stream;
    }
    parseData(data) {
        this.info.status = "downloading";
        try {
            console.log(">>>>> PARSE JSON <<<<<");
            let json = JSON.parse(`${data}`);
            if (json) {
                // console.log(json);
                console.log(" -- valid JSON -- ");
                if (json.title && json.title == 'playlist') {
                    this.info.title = this.info.id;
                    this.info.filename = `${this.info.id}`;
                } else if (json.title) {
                    this.info.title = json.title;
                    this.info.thumbnail = json.thumbnail;
                    this.info.author = json.uploader;
                    this.info.filename = json._filename;
                }
                //console.log(this);
                this.info.filename = (this.info.filename.endsWith(".mp4")) ? this.info.filename.substr(0, this.info.filename.length - 4) : this.info.filename;
            }
        } catch (error) {
            console.log(">>>>> JSON ERROR <<<<<");
            console.log(data);
        }
    }
    altUrl() {
        // -- TODO: implement custom extractors for sites needing altURL

        // VK.com
        if (this.info.url.indexOf("vk.com/") >= 0 && this.info.url.indexOf('oid=') >= 0) {
            // https://vk.com/video_ext.php?oid=185303839&id=456239694&hash=7f024588c463cee1
            // https://vk.com/video185303839_456239694
            let uparts = this.info.url.split("?");
            if (uparts.length > 1) {
                let qparts = uparts[1].split("&");
                let oid = "";
                let id = "";
                for (var i = 0; i < qparts.length; i++) {
                    if (qparts[i].startsWith("oid=")) oid = qparts[i].substr(4, qparts[i].length - 4);
                    if (qparts[i].startsWith("id=")) id = qparts[i].substr(3, qparts[i].length - 3);
                }
                if (oid && id) {
                    this.info.url = `https://vk.com/video${oid}_${id}`
                }
            }
        }
        // Liveme.com
        if (this.info.url.indexOf("liveme.com/") >= 0) {
            // https://www.liveme.com/ru/v/16044863810378006243/index.html?f=liveOMG
            // https://hlslive.zg.linkv.fun/yolo/16044863810378006243/playlist.m3u8?lhls=1
            let uparts = this.info.url.split("/");
            let vid = uparts[5];

            // try {
            //     let response = await got(this.url);
            //     let dom = new JSDOM(response.body);
            //     this.title = (dom.window.document.querySelector('title').textContent);
            //     this.author = this.title;
            //     this.force_meta = true;
            //     console.log(`>>>>>>> TITLE: ${this.title}`);
            // } catch (error) {
            //     this.title = this.id;
            // }
            // this.filename = this.title + ".mp4";
            this.info.url = `https://hlslive.zg.linkv.fun/yolo/${vid}/playlist.m3u8?lhls=1`;
            this.info.filename = this.info.id;
            //console.log(this.title);
            //console.log(this.filename);
        }
        console.log(this.url);
    }
    downloadVideo() {
        this.info.status = "starting";

        let opts = {
            cwd: app.settings.savepath,
            shell: true,
            detached: true
        };
        let args = [
            "--print-json",
            "-ciw",
            "--hls-use-mpegts",
            "--no-part",
            "-f \"best[ext=mp4]\""
        ];
        // override filename if already set
        for (var i = 0; i < Video.list.length; i++) {
            var vt = Video.list[i];
            if (vt.info.o_url == this.info.o_url) {
                var tidx = 0;
                while (true) {
                    tidx++;
                    var fn = `${vt.info.filename}`;
                    var fnt = (fn.endsWith(".mp4")) ? fn.substr(0, fn.length - 4) : fn;
                    fnt = `${fnt}.${tidx}`;
                    if (!fs.existsSync(app.settings.savepath + fnt + ".mp4")) {
                        this.info.filename = fnt;
                        console.log("SETTING FILENAME TO: " + fnt);
                        break;
                    }
                }
                break;
            }
        }
        if (this.info.filename) {
            var fn = `${this.info.filename}`;
            fn = (fn.endsWith(".mp4")) ? fn.substr(0, fn.length - 4) : fn;
            args.push(`-o '${fn}.%(ext)s'`);
        }
        // add URL
        args.push(this.info.url);

        let stream = this.stream = spawn("youtube-dl", args, opts);
        Video.emit('dl-info', this.info)

        stream.on('message', (msg) => {
            console.log(`MESSAGE: ${msg}`);
        });
        stream.stdout.on('data', (data) => {
            console.log(`stdout.DATA...`);
            let json = data;
            if (data instanceof Buffer) {
                console.log("BUFFER");
                let str = data.toString().trim();;
                this.buffer = (this.buffer) ? this.buffer + str : str;
                try {
                    // check to see if buffer is complete JSON block
                    JSON.parse(this.buffer);
                    json = this.buffer;
                    delete this.buffer;
                } catch (error) {
                    // incomplete buffer
                    return;
                }
            }
            this.parseData(json);
            //console.log(this.info);
            Video.emit('dl-info', this.info)
        });
        stream.stderr.on('data', (data) => {
            this.info.status = "error";
            this.info.error = data;
            console.error(`stderr DATA(${this.info.id}): ${data}`);
            Video.emit('dl-info', this.info);
        });
        stream.stdout.on('error', (err) => {
            console.log(`ERROR(${this.info.id}): ${err}`);
            this.info.status = "error";
            this.info.error = err;
            Video.emit('dl-info', this.info);
        });
        stream.on('close', (code) => {
            this.info.status = "ended";
            console.log(`CLOSE(${this.info.id}): exited with code ${code}`);
            this.info.status = (code == 0) ? "complete" : "closed";
            Video.emit('dl-info', this.info);
            //console.log(this);
        });
    }

}
module.exports = Video;