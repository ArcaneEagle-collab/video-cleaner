const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn, execSync } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let backendProcess = null;
let activePort = 8000;
let isQuitting = false;

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

function logToFile(msg) {
  try {
    const appData = process.env.APPDATA || path.join(app.getPath("home"), "AppData", "Roaming");
    const logDir = path.join(appData, "Video Cleaner", "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "electron.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

/**
 * Starts the Python FastAPI backend process silently without a terminal window.
 */
async function startBackendProcess(port) {
  const { isPackaged, backendExe, ffmpegDir } = getApplicationPaths();

  let exePath = backendExe;
  let args = ["--host", "127.0.0.1", "--port", String(port)];

  if (ffmpegDir && fs.existsSync(ffmpegDir)) {
    args.push("--ffmpeg-dir", ffmpegDir);
  }

  logToFile(`Resolving backend: exePath="${exePath}", ffmpegDir="${ffmpegDir}"`);

  // Fallback to python server_entry.py if server.exe not built yet in dev
  if (!fs.existsSync(exePath)) {
    const devEntry = path.resolve(__dirname, "..", "backend", "server_entry.py");
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
          path: "/",
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
 * Gracefully terminates backend and any spawned child processes.
 */
function stopBackendProcess() {
  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: "ignore" });
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
 * Creates the primary application window.
 */
function createMainWindow(port, isHealthy) {
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allows local streaming without CORS restrictions
    },
  });

  if (isHealthy) {
    const { frontendDir } = getApplicationPaths();
    const indexPath = path.join(frontendDir, "index.html");

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath, { query: { apiPort: String(port) } });
    } else {
      // Dev mode fallback
      mainWindow.loadURL(`http://127.0.0.1:5173/?apiPort=${port}`);
    }
  } else {
    // Friendly startup failure display
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Video Cleaner - Startup</title>
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
          .btn {
            background: linear-gradient(135deg, #D4AF37 0%, #AA7C11 100%);
            color: #0A0A0C;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>Video Cleaner couldn't start correctly</h2>
          <p>The local video processing engine did not respond in time.<br/>Please restart the application.</p>
          <p>If the problem continues, open <strong>Settings &rarr; Diagnostics</strong> or check your system permissions.</p>
          <button class="btn" onclick="location.reload()">Retry Connection</button>
        </div>
      </body>
      </html>
    `)}`
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Setup IPC Handlers
ipcMain.handle("get-api-port", () => activePort);

ipcMain.handle("open-directory", async (_event, dirPath) => {
  if (dirPath && fs.existsSync(dirPath)) {
    shell.openPath(dirPath);
  }
});

ipcMain.handle("open-logs-folder", async () => {
  const appData = process.env.APPDATA || path.join(app.getPath("home"), "AppData", "Roaming");
  const logsDir = path.join(appData, "Video Cleaner", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  shell.openPath(logsDir);
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
  return {
    hasUpdate: false,
    currentVersion: "1.0.0",
    message: "You are running the latest version: 1.0.0 (Up to date)",
  };
});

// App Lifecycle
app.whenReady().then(async () => {
  activePort = await findFreePort(8000);
  await startBackendProcess(activePort);
  const isHealthy = await waitForBackendHealthy(activePort, 12000);
  createMainWindow(activePort, isHealthy);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(activePort, isHealthy);
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
