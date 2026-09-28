const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let backendProcess = null;
let activePort = 8000;
let isQuitting = false;

// ─── Auto-Updater Setup ───────────────────────────────────────────────────────
// electron-updater handles everything: silent download, install on restart.
// Users NEVER see GitHub. They only see the in-app notification you design.
autoUpdater.autoDownload = true;          // Download silently in background
autoUpdater.autoInstallOnAppQuit = true;  // Install when app is closed
autoUpdater.logger = null;                // We handle logging ourselves

function setupAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    logToFile("[Updater] Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    logToFile(`[Updater] Update available: ${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", {
        hasUpdate: true,
        currentVersion: app.getVersion(),
        latestVersion: info.version,
        releaseNotes: typeof info.releaseNotes === "string"
          ? info.releaseNotes.replace(/<[^>]*>/g, "").slice(0, 500)
          : "",
        releaseName: info.releaseName || `Version ${info.version}`,
        isDownloading: true,
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    logToFile("[Updater] App is up to date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    logToFile(`[Updater] Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-download-progress", {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    logToFile(`[Updater] Update downloaded: ${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-ready", {
        version: info.version,
        releaseName: info.releaseName || `Version ${info.version}`,
        releaseNotes: typeof info.releaseNotes === "string"
          ? info.releaseNotes.replace(/<[^>]*>/g, "").slice(0, 500)
          : "",
      });
    }
  });

  autoUpdater.on("error", (err) => {
    logToFile(`[Updater] Error: ${err.message}`);
  });
}


// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // Inspect command line for file path to open
      const videoCandidate = commandLine.find((arg) =>
        /\.(mp4|mov|mkv|webm|avi)$/i.test(arg)
      );
      if (videoCandidate && fs.existsSync(videoCandidate)) {
        mainWindow.webContents.send("video-dropped", path.resolve(videoCandidate));
      }
    }
  });
}

/**
 * Finds an available local port on 127.0.0.1 starting from startPort.
 */
function findFreePort(startPort = 8000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}

/**
 * Resolves paths for backend executable, ffmpeg directory, and frontend assets.
 */
function getApplicationPaths() {
  const isPackaged = app.isPackaged;
  let backendExe;
  let ffmpegDir;
  let frontendDir;

  if (isPackaged) {
    const resourcesPath = process.resourcesPath;
    backendExe = path.join(resourcesPath, "backend", "server.exe");
    ffmpegDir = path.join(resourcesPath, "ffmpeg");
    frontendDir = path.join(__dirname, "..", "frontend", "dist");
    if (!fs.existsSync(frontendDir)) {
      frontendDir = path.join(resourcesPath, "app", "frontend", "dist");
    }
  } else {
    const rootDir = path.resolve(__dirname, "..");
    backendExe = path.join(rootDir, "dist-backend", "server", "server.exe");
    ffmpegDir = path.join(rootDir, "resources", "ffmpeg");
    frontendDir = path.join(rootDir, "frontend", "dist");
  }

  return { isPackaged, backendExe, ffmpegDir, frontendDir };
}

function getLogsDirectory() {
  const appData = process.env.APPDATA || path.join(app.getPath("home"), "AppData", "Roaming");
  const logDir = path.join(appData, "Video Cleaner", "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function logToFile(msg) {
  try {
    const logDir = getLogsDirectory();
    fs.appendFileSync(path.join(logDir, "electron.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

/**
 * Starts the Python FastAPI backend process silently without any terminal window.
 */
async function startBackendProcess(port) {
  const { isPackaged, backendExe, ffmpegDir } = getApplicationPaths();

  let exePath = backendExe;
  let args = ["--host", "127.0.0.1", "--port", String(port)];

  if (ffmpegDir && fs.existsSync(ffmpegDir)) {
    args.push("--ffmpeg-dir", ffmpegDir);
  }

  logToFile(`Resolving backend: exePath="${exePath}", ffmpegDir="${ffmpegDir}"`);

  // In development, prefer live python backend code so changes reflect immediately
  const devEntry = path.resolve(__dirname, "..", "backend", "server_entry.py");
  if (!isPackaged && fs.existsSync(devEntry)) {
    exePath = "python";
    args = [devEntry, ...args];
  } else if (!fs.existsSync(exePath)) {
    if (fs.existsSync(devEntry)) {
      exePath = "python";
      args = [devEntry, ...args];
    } else {
      const err = `Backend executable not found at: ${backendExe}`;
      logToFile(err);
      throw new Error(err);
    }
  }

  const spawnOptions = {
    detached: false,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  };

  logToFile(`Launching backend: "${exePath}" ${args.join(" ")}`);
  try {
    backendProcess = spawn(exePath, args, spawnOptions);

    backendProcess.stdout.on("data", (data) => {
      logToFile(`[Backend STDOUT] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on("data", (data) => {
      logToFile(`[Backend STDERR] ${data.toString().trim()}`);
    });

    backendProcess.on("error", (err) => {
      logToFile(`Backend process spawn error: ${err.message}`);
    });

    backendProcess.on("exit", (code, signal) => {
      logToFile(`Backend process exited with code ${code}, signal ${signal}`);
      backendProcess = null;
    });
  } catch (err) {
    logToFile(`Failed to spawn backend: ${err.message}`);
  }
}

/**
 * Polls the backend health check endpoint until responsive or timeout.
 */
function waitForBackendHealthy(port, timeoutMs = 15000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: port,
          path: "/api/system/info",
          timeout: 1000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else if (Date.now() - startTime < timeoutMs) {
            setTimeout(check, 300);
          } else {
            resolve(false);
          }
        }
      );

      req.on("error", () => {
        if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 300);
        } else {
          resolve(false);
        }
      });

      req.end();
    };

    check();
  });
}

/**
 * Gracefully terminates backend and any spawned child processes without flashing a console.
 */
function stopBackendProcess() {
  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(backendProcess.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        backendProcess.kill("SIGTERM");
      }
    } catch {
      // Process already closed
    }
    backendProcess = null;
  }
}

/**
 * Creates the primary application window with an immediate branded loading screen.
 */
function createMainWindow() {
  if (mainWindow) return;

  const iconPath = path.resolve(__dirname, "..", "video_cleaner.ico");

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: "Video Cleaner by Amna",
    backgroundColor: "#0A0A0C",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allows local streaming without CORS restrictions
    },
  });

  // Display initial loading splash immediately
  renderSplashScreen("Starting Video Cleaner...");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function renderSplashScreen(statusText) {
  if (!mainWindow) return;
  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Video Cleaner by Amna</title>
      <style>
        body {
          background: #0A0A0C;
          color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          user-select: none;
        }
        .splash-card {
          text-align: center;
          max-width: 420px;
          padding: 40px;
        }
        .logo-box {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(212, 175, 55, 0.05) 100%);
          border: 1px solid rgba(212, 175, 55, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(212, 175, 55, 0.2);
        }
        .logo-box svg {
          width: 32px;
          height: 32px;
          fill: none;
          stroke: #F3D079;
          stroke-width: 2.2;
        }
        h1 {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #FFF0B3 0%, #D4AF37 50%, #F5D77F 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 6px 0;
        }
        .subtitle {
          font-size: 11px;
          color: #F3D079;
          font-weight: 600;
          letter-spacing: 0.04em;
          margin-bottom: 24px;
        }
        .spinner {
          width: 36px;
          height: 36px;
          margin: 0 auto 16px;
          border: 3px solid rgba(212, 175, 55, 0.15);
          border-top-color: #D4AF37;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .status {
          font-size: 13px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <div class="splash-card">
        <div class="logo-box">
          <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
        </div>
        <h1>Video Cleaner</h1>
        <div class="subtitle">by Amna</div>
        <div class="spinner"></div>
        <div class="status">${statusText}</div>
      </div>
    </body>
    </html>
  `)}`
  );
}

function loadApplicationUI(port) {
  if (!mainWindow) return;
  const { frontendDir } = getApplicationPaths();
  const indexPath = path.join(frontendDir, "index.html");

  if (fs.existsSync(indexPath)) {
    logToFile(`Loading bundled production frontend: ${indexPath}`);
    mainWindow.loadFile(indexPath, { query: { apiPort: String(port) } });
  } else {
    logToFile(`Dev mode: loading http://127.0.0.1:5173/?apiPort=${port}`);
    mainWindow.loadURL(`http://127.0.0.1:5173/?apiPort=${port}`);
  }
}

function showStartupError() {
  if (!mainWindow) return;
  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Video Cleaner - Startup Error</title>
      <style>
        body {
          background: #0A0A0C;
          color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        .box {
          background: #14141A;
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 16px;
          padding: 40px;
          max-width: 480px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.8);
        }
        h2 { color: #F3D079; margin-top: 0; }
        p { color: #94A3B8; font-size: 14px; line-height: 1.6; }
        .actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 24px;
        }
        .btn {
          background: linear-gradient(135deg, #D4AF37 0%, #AA7C11 100%);
          color: #0A0A0C;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          font-size: 13px;
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #F8FAFC;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Video Cleaner couldn't start correctly</h2>
        <p>The local video processing engine did not respond in time.<br/>No changes were made to your videos.</p>
        <div class="actions">
          <button class="btn" onclick="location.reload()">Retry Connection</button>
          <button class="btn btn-secondary" onclick="window.electronAPI?.openLogsFolder()">View Logs</button>
        </div>
      </div>
    </body>
    </html>
  `)}`
  );
}

// Setup IPC Handlers
ipcMain.handle("get-api-port", () => activePort);

ipcMain.handle("open-directory", async (_event, dirPath) => {
  if (dirPath && fs.existsSync(dirPath)) {
    shell.openPath(dirPath);
  }
});

ipcMain.handle("open-logs-folder", async () => {
  const logsDir = getLogsDirectory();
  shell.openPath(logsDir);
});

ipcMain.handle("open-dashboard", async () => {
  shell.openExternal(`http://127.0.0.1:${activePort}/dashboard`);
});

ipcMain.handle("open-file", async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.openPath(filePath);
    return true;
  }
  return false;
});

ipcMain.handle("show-item-in-folder", async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle("get-default-downloads-dir", async () => {
  try {
    return app.getPath("downloads");
  } catch {
    return path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");
  }
});

ipcMain.handle("select-directory", async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select Output Folder for Cleaned Videos",
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});

ipcMain.handle("check-for-updates", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { checking: true, currentVersion: app.getVersion() };
  } catch (err) {
    return { checking: false, error: err.message, currentVersion: app.getVersion() };
  }
});

// User clicked "Restart & Install" in the in-app notification
ipcMain.handle("install-update", async () => {
  autoUpdater.quitAndInstall(false, true);
});

// App Lifecycle
app.whenReady().then(async () => {
  // Handle downloads automatically to Downloads folder without blocking
  try {
    session.defaultSession.on("will-download", (_event, item) => {
      const downloadsDir = app.getPath("downloads");
      const defaultName = item.getFilename();
      const savePath = path.join(downloadsDir, defaultName);
      item.setSavePath(savePath);
    });
  } catch {}

  // Setup auto-updater event listeners (must be before any check calls)
  setupAutoUpdater();

  createMainWindow();

  try {
    activePort = await findFreePort(8000);
    renderSplashScreen("Starting local video processing engine...");
    await startBackendProcess(activePort);
    const isHealthy = await waitForBackendHealthy(activePort, 15000);

    if (isHealthy) {
      loadApplicationUI(activePort);

      // Check for updates 12 seconds after UI loads (let the app settle first)
      // electron-updater will silently download and notify via IPC when ready
      setTimeout(() => {
        try {
          autoUpdater.checkForUpdates().catch((e) => {
            logToFile(`[Updater] Check failed: ${e.message}`);
          });
        } catch {}
      }, 12000);

    } else {
      showStartupError();
    }
  } catch (err) {
    logToFile(`Startup error: ${err.message}`);
    showStartupError();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackendProcess();
});

app.on("will-quit", () => {
  stopBackendProcess();
});

app.on("window-all-closed", () => {
  stopBackendProcess();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
