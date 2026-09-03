const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  showWindow: () => ipcRenderer.send("show-window"),
  getLaunchAtLogin: () => ipcRenderer.invoke("get-launch-at-login"),
  setLaunchAtLogin: (value) => ipcRenderer.invoke("set-launch-at-login", value),
});
