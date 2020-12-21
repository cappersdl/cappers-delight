const { ipcRenderer, shell, ipcMain } = require("electron");

const ready = (fn) => {
    if (document.readyState != 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}
exports.ready = ready;
