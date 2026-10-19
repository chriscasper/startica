// Preload for the About window: it can read the app's details and the update status,
// and ask for an update check. Nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("about", {
  info: () => ipcRenderer.invoke("about", "info"),
  check: () => ipcRenderer.invoke("about", "check"),
  onStatus: (callback) => ipcRenderer.on("about:status", (_event, status) => callback(status)),
});
