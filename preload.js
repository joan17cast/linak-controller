const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  showWindow: () => ipcRenderer.send("show-window"),
  hideWindow: () => ipcRenderer.send("hide-window"),
  openOptions: () => ipcRenderer.send("open-options"),
  cancelBluetoothScan: () => ipcRenderer.send("cancel-bluetooth-scan"),
  getLaunchAtLogin: () => ipcRenderer.invoke("get-launch-at-login"),
  setLaunchAtLogin: (value) => ipcRenderer.invoke("set-launch-at-login", value),
});
