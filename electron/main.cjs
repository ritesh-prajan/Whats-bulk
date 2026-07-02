const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ─────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────
const PORT = 3000;
const SERVER_STARTUP_TIMEOUT = 45000; // 45 seconds max wait
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let serverProcess = null;
let serverReady = false;

// ─────────────────────────────────────────
//  Spawn the Express / WhatsApp server
// ─────────────────────────────────────────
function startServer() {
  const serverScript = isDev
    ? path.join(__dirname, '..', 'server.ts')
    : path.join(process.resourcesPath, 'app', 'dist', 'server.cjs');

  const executable = isDev ? 'tsx' : 'node';

  console.log(`[Electron] Starting backend server: ${executable} ${serverScript}`);

  const env = {
    ...process.env,
    PORT: String(PORT),
    ELECTRON: 'true',
    NODE_ENV: isDev ? 'development' : 'production',
  };

  serverProcess = spawn(executable, [serverScript], {
    cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    console.log(`[Server] ${msg}`);
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Server ERR] ${msg}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Electron] Server process exited with code ${code}`);
    serverProcess = null;
  });
}

// ─────────────────────────────────────────
//  Poll until server is responding
// ─────────────────────────────────────────
function waitForServer(timeout = SERVER_STARTUP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server did not start within ${timeout / 1000}s`));
        return;
      }
      setTimeout(check, 1000);
    };

    check();
  });
}

// ─────────────────────────────────────────
//  Create the main browser window
// ─────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#09090b',
    title: 'WHATS-BULK — Enterprise WhatsApp Campaign Engine',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    frame: true,
    show: false, // show after page loads to avoid flash
    titleBarStyle: 'default',
  });

  // Show splash/loading screen first
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────
//  Kill server cleanly on app exit
// ─────────────────────────────────────────
function killServer() {
  if (serverProcess) {
    console.log('[Electron] Killing server process...');
    try {
      // On Windows, we need to kill the process tree
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Error killing server:', e.message);
    }
    serverProcess = null;
  }
}

// ─────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  startServer();

  try {
    console.log('[Electron] Waiting for backend server to be ready...');
    await waitForServer();
    console.log('[Electron] Server is ready! Loading app...');

    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  } catch (err) {
    console.error('[Electron] Server failed to start:', err.message);
    if (mainWindow) {
      dialog.showErrorBox(
        'Server Failed to Start',
        `The WhatsApp backend server could not start.\n\n${err.message}\n\nPlease restart the app.`
      );
    }
  }
});

app.on('window-all-closed', () => {
  killServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
