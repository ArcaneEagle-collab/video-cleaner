const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getApiPort: () => ipcRenderer.invoke("get-api-port"),
  openDirectory: (dirPath) => ipcRenderer.invoke("open-directory", dirPath),
  openLogsFolder: () => ipcRenderer.invoke("open-logs-folder"),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  openDashboard: () => ipcRenderer.invoke("open-dashboard"),
  onVideoDropped: (callback) => {
    ipcRenderer.on("video-dropped", (_event, filePath) => callback(filePath));
  },
});
