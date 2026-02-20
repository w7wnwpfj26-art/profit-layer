const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (data) => ipcRenderer.invoke("set-settings", data),
});
