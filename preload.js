const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  showWindow: () => ipcRenderer.send("show-window"),
  openOptions: () => ipcRenderer.send("open-options"),
  getLaunchAtLogin: () => ipcRenderer.invoke("get-launch-at-login"),
  setLaunchAtLogin: (value) => ipcRenderer.invoke("set-launch-at-login", value),
});
