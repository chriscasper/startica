// Preload for the posting window's Startica bar: the only page in that window with
// a bridge to the app, and it can only ask for these four things.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posting", {
  onState: (callback) => ipcRenderer.on("posting:state", (_event, state) => callback(state)),
  fill: () => ipcRenderer.invoke("posting", "fill"),
  copy: () => ipcRenderer.invoke("posting", "copy"),
  saveLink: (url) => ipcRenderer.invoke("posting", "save-link", url),
  close: () => ipcRenderer.invoke("posting", "close"),
});
