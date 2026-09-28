const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getApiPort: () => ipcRenderer.invoke("get-api-port"),
  openDirectory: (dirPath) => ipcRenderer.invoke("open-directory", dirPath),
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke("show-item-in-folder", filePath),
  getDefaultDownloadsDir: () => ipcRenderer.invoke("get-default-downloads-dir"),
  openLogsFolder: () => ipcRenderer.invoke("open-logs-folder"),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  openDashboard: () => ipcRenderer.invoke("open-dashboard"),

  // ── Auto-Update ──────────────────────────────────────────────────────────
  // Manually trigger an update check (e.g. from Settings modal)
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  // Quit the app and install the already-downloaded update immediately
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // ── IPC Event Listeners ──────────────────────────────────────────────────
  onVideoDropped: (callback) => {
    ipcRenderer.on("video-dropped", (_event, filePath) => callback(filePath));
  },
  // Fired when a newer version is found and is being downloaded silently
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (_event, updateInfo) => callback(updateInfo));
  },
  // Fired periodically with download progress (0-100%)
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on("update-download-progress", (_event, progress) => callback(progress));
  },
  // Fired when the update has finished downloading and is ready to install
  onUpdateReady: (callback) => {
    ipcRenderer.on("update-ready", (_event, info) => callback(info));
  },
});
