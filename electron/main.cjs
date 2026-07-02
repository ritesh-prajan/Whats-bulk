const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ─────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────
const PORT = 3000;
const SERVER_STARTUP_TIMEOUT = 60000; // 60 seconds
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let serverProcess = null;

// ─────────────────────────────────────────
//  Find node.exe on Windows
// ─────────────────────────────────────────
function getNodeExecutable() {
  // In packaged Electron, use the bundled Node inside Electron itself
  const electronExe = process.execPath; // e.g. C:\...\WHATS-BULK.exe
  const electronDir = path.dirname(electronExe);

  // Electron ships with a node binary next to it
  const candidates = [
    path.join(electronDir, 'node.exe'),
    path.join(electronDir, 'node'),
    'node', // fallback: hope it's in PATH
  ];

  for (const candidate of candidates) {
    try {
      if (candidate === 'node') return 'node';
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }

  return 'node';
}

// ─────────────────────────────────────────
//  Spawn the Express / WhatsApp server
// ─────────────────────────────────────────
function startServer() {
  let serverScript;
  let cwd;

  if (isDev) {
    serverScript = path.join(__dirname, '..', 'server.ts');
    cwd = path.join(__dirname, '..');
  } else {
    // With asar:false, files land in resources/app/
    serverScript = path.join(process.resourcesPath, 'app', 'dist', 'server.cjs');
    cwd = path.join(process.resourcesPath, 'app');
  }

  const executable = isDev ? 'tsx' : process.execPath;

  console.log(`[Electron] Starting backend: ${executable}`);
  console.log(`[Electron] Server script: ${serverScript}`);
  console.log(`[Electron] CWD: ${cwd}`);
  console.log(`[Electron] Script exists: ${fs.existsSync(serverScript)}`);

  // For production, use Electron's own Node runtime
  // by passing --require to run the server via Electron's internal node
  const args = isDev ? [serverScript] : ['--no-warnings', serverScript];

  const env = {
    ...process.env,
    PORT: String(PORT),
    ELECTRON: 'true',
    NODE_ENV: isDev ? 'development' : 'production',
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (!isDev) {
    // Run the server using Electron's built-in Node (ELECTRON_RUN_AS_NODE=1)
    serverProcess = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    serverProcess = spawn(executable, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Server ERR] ${msg}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Electron] Server exited with code ${code}`);
    serverProcess = null;
  });
}

// ─────────────────────────────────────────
//  Poll until server responds
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
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server did not start within ${timeout / 1000}s`));
        return;
      }
      setTimeout(check, 1500);
    };

    setTimeout(check, 2000); // Give it 2s before first check
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
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─────────────────────────────────────────
//  Kill server on exit
// ─────────────────────────────────────────
function killServer() {
  if (serverProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Kill error:', e.message);
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
    console.log('[Electron] Waiting for backend...');
    await waitForServer();
    console.log('[Electron] Backend ready! Loading app...');
    if (mainWindow) mainWindow.loadURL(`http://localhost:${PORT}`);
  } catch (err) {
    console.error('[Electron] Server failed:', err.message);
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

app.on('before-quit', killServer);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
