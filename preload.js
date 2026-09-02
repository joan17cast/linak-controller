const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  showWindow: () => ipcRenderer.send("show-window"),
});
