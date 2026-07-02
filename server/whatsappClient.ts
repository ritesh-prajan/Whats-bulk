import whatsapp from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = whatsapp;
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

function killHeadlessChromeWindows() {
  if (process.platform !== 'win32') return;
  try {
    const cmd = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe' and CommandLine like '%--headless%'\\" | Remove-CimInstance"`;
    execSync(cmd, { stdio: 'ignore' });
    console.log('Cleaned dangling headless Chrome processes via PowerShell CimInstance.');
  } catch (e) {
    try {
      execSync('wmic process where "name=\'chrome.exe\' and CommandLine like \'%--headless%\'" call terminate', { stdio: 'ignore' });
      console.log('Cleaned dangling headless Chrome processes via wmic.');
    } catch (err2) {}
  }
}

function deleteSingletonLocks(dirPath: string, isRoot = true) {
  if (isRoot) {
    killHeadlessChromeWindows();
  }
  if (!fs.existsSync(dirPath)) return;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
          deleteSingletonLocks(fullPath, false);
        } else if (file === 'SingletonLock' || file === 'SingletonCookie' || file === 'SingletonSocket') {
          fs.unlinkSync(fullPath);
          console.log(`Successfully removed legacy singleton lock file/symlink: ${fullPath}`);
        }
      } catch (err: any) {
        // Decouple any file locks or access errors
      }
    }
  } catch (err: any) {
    console.warn(`Error during locks clean-up in ${dirPath}:`, err.message);
  }
}

export class WhatsAppClient {
  public client: any;
  private qrData: string | null = null;
  private status: 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED' = 'DISCONNECTED';
  private clientInfo: { pushname: string; phone: string; profilePicUrl: string | null } | null = null;
  private initError: string | null = null;
  private initLogs: string[] = [];

  private logInit(msg: string, isError = false) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${msg}`;
    this.initLogs.push(formatted);
    if (this.initLogs.length > 50) this.initLogs.shift();
    if (isError) {
      console.error(`[WA-INIT] ${msg}`);
    } else {
      console.log(`[WA-INIT] ${msg}`);
    }
  }

  private getChromeExecutablePath(): string | undefined {
    if (process.platform !== 'win32') return undefined;
    const standardPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) {
        console.log(`[WA-INIT] Using local Google Chrome installation at: ${p}`);
        return p;
      }
    }
    return undefined;
  }

  private getClientOptions(authPath: string) {
    return {
      authStrategy: new LocalAuth({
        dataPath: authPath
      }),
      qrTimeoutMs: 0, // Disable QR timeout so it doesn't expire if user takes time to scan
      authTimeoutMs: 60000, // Allow 60 seconds for authentication to complete
      puppeteer: {
        executablePath: this.getChromeExecutablePath(),
        protocolTimeout: 300000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-site-isolation-trials',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        ],
        headless: true
      }
    };
  }

  constructor() {
    const authPath = path.join(process.cwd(), '.wwebjs_auth');
    this.client = new Client(this.getClientOptions(authPath));
    this.setupListeners();
  }

  private setupListeners() {
    this.client.on('qr', async (qr) => {
      this.qrData = await QRCode.toDataURL(qr);
      this.status = 'QR';
      console.log('QR Code generated. Scan to connect.');
    });

    this.client.on('ready', async () => {
      this.status = 'CONNECTED';
      this.qrData = null;
      console.log('WhatsApp Client is ready!');
      try {
        const info = this.client.info;
        if (info) {
          const pushname = info.pushname || '';
          const wid = info.wid || info.me;
          const phone = wid ? wid.user : '';
          let profilePicUrl = null;
          if (wid && wid._serialized) {
            try {
              profilePicUrl = await this.client.getProfilePicUrl(wid._serialized);
            } catch (picErr) {
              // Ignore profile pic fetching error
            }
          }
          this.clientInfo = {
            pushname,
            phone,
            profilePicUrl
          };
          console.log(`Fetched logged-in details: ${pushname} (${phone})`);
        }
      } catch (err: any) {
        console.warn('Could not fetch logged-in user info:', err.message);
      }
    });

    this.client.on('authenticated', () => {
      console.log('Authenticated successfully');
    });

    this.client.on('auth_failure', (msg) => {
      this.status = 'DISCONNECTED';
      this.clientInfo = null;
      console.error('Authentication failure:', msg);
    });

    this.client.on('disconnected', () => {
      this.status = 'DISCONNECTED';
      this.clientInfo = null;
      console.log('WhatsApp Client disconnected');
    });
  }

  public async initialize(attempt = 1) {
    if (this.status === 'CONNECTED') return;
    if (this.status === 'CONNECTING' && attempt === 1) return;
    
    this.status = 'CONNECTING';
    this.initError = null;
    this.logInit(`Starting WhatsApp client initialization (Attempt ${attempt}/3)...`);
    try {
      const authPath = path.join(process.cwd(), '.wwebjs_auth');
      this.logInit(`Checking session filesystem at: ${authPath}`);
      deleteSingletonLocks(authPath);

      this.logInit('Launching Puppeteer headless browser instance...');
      await this.client.initialize();
      this.logInit('Client initialized and listening for actions.');
    } catch (err: any) {
      this.status = 'DISCONNECTED';
      this.initError = err.message || String(err);
      this.logInit(`Initialization error on attempt ${attempt}: ${this.initError}`, true);

      const errorText = this.initError.toLowerCase();
      const isTransient = errorText.includes('detached frame') ||
                          errorText.includes('execution context') ||
                          errorText.includes('target closed') ||
                          errorText.includes('navigation failed') ||
                          errorText.includes('timeout');

      if (attempt < 3 && isTransient) {
        this.logInit(`Transient error detected during session startup. Retrying in 4 seconds to recover cleanly...`);
        try {
          await this.client.destroy();
        } catch (destroyErr) {
          // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 4000));

        const authPath = path.join(process.cwd(), '.wwebjs_auth');
        deleteSingletonLocks(authPath);
        this.logInit('Re-creating a clean WhatsApp Client configuration for the retry attempt...');
        this.client = new Client(this.getClientOptions(authPath));
        this.setupListeners();

        return this.initialize(attempt + 1);
      } else if (attempt < 3) {
        this.logInit(`Non-specific error detected during session startup. Retrying in 6 seconds...`);
        try {
          await this.client.destroy();
        } catch (destroyErr) {
          // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 6050));

        const authPath = path.join(process.cwd(), '.wwebjs_auth');
        deleteSingletonLocks(authPath);
        this.logInit('Re-creating a clean WhatsApp Client configuration for the retry attempt...');
        this.client = new Client(this.getClientOptions(authPath));
        this.setupListeners();

        return this.initialize(attempt + 1);
      } else {
        this.logInit(`Max initialization attempts reached (3/3). Please trigger a Hard Reset or retry.`, true);
      }
    }
  }

  public getStatus() {
    return {
      status: this.status,
      qr: this.qrData,
      clientInfo: this.clientInfo,
      initError: this.initError,
      initLogs: this.initLogs
    };
  }

  public async forceReset() {
    this.logInit('Forcing a system-wide hard reset of the WhatsApp client...');
    try {
      if (this.client) {
        this.logInit('Closing the current Puppeteer browser process...');
        try {
          await this.client.destroy();
        } catch (e: any) {
          this.logInit(`Browser destruction warning: ${e.message}`);
        }
      }
    } catch (err: any) {
      this.logInit(`Error during client shutdown: ${err.message}`, true);
    } finally {
      this.status = 'DISCONNECTED';
      this.qrData = null;
      this.clientInfo = null;
      this.initError = null;

      const authPath = path.join(process.cwd(), '.wwebjs_auth');
      this.logInit(`Purging authorization folder to unlock files: ${authPath}`);
      try {
        if (fs.existsSync(authPath)) {
          fs.rmSync(authPath, { recursive: true, force: true });
          this.logInit('Successfully purged authorization folder.');
        }
      } catch (rmErr: any) {
        this.logInit(`Folder purge warning: ${rmErr.message}. Cleaning locks instead.`, true);
        deleteSingletonLocks(authPath);
      }

      const backupPath = path.join(process.cwd(), 'sessions_backup');
      this.logInit(`Purging backup sessions folder: ${backupPath}`);
      try {
        if (fs.existsSync(backupPath)) {
          fs.rmSync(backupPath, { recursive: true, force: true });
          this.logInit('Successfully purged backup sessions folder.');
        }
      } catch (backupErr: any) {
        this.logInit(`Backup folder purge warning: ${backupErr.message}`, true);
      }

      this.logInit('Re-creating a clean WhatsApp Client configuration...');
      try {
        this.client.removeAllListeners();
      } catch (e) {}
      this.client = new Client(this.getClientOptions(authPath));
      this.setupListeners();
      
      this.logInit('Triggering fresh initialization sequence...');
      this.initialize().catch(err => {
        this.logInit(`Async init failed after reset: ${err.message}`, true);
      });
    }
    return { success: true };
  }

  public async softRefresh() {
    this.logInit('Requesting a soft refresh of the connection (restarting Puppeteer, retaining session keys)...');
    try {
      if (this.client) {
        this.logInit('Destroying current Puppeteer browser processes...');
        try {
          await this.client.destroy();
        } catch (e: any) {
          this.logInit(`Browser destruction warning during soft refresh: ${e.message}`);
        }
      }
    } catch (err: any) {
      this.logInit(`Error during client shutdown: ${err.message}`, true);
    } finally {
      this.status = 'DISCONNECTED';
      this.qrData = null;
      this.clientInfo = null;
      this.initError = null;

      const authPath = path.join(process.cwd(), '.wwebjs_auth');
      this.logInit('Cleaning up singleton lock files to prevent lock collision...');
      deleteSingletonLocks(authPath);

      this.logInit('Re-creating WhatsApp Client configuration with existing session...');
      try {
        this.client.removeAllListeners();
      } catch (e) {}
      this.client = new Client(this.getClientOptions(authPath));
      this.setupListeners();

      this.logInit('Triggering initialization sequence...');
      this.initialize().catch(err => {
        this.logInit(`Async init failed after soft refresh: ${err.message}`, true);
      });
    }
    return { success: true };
  }

  public async logout() {
    try {
      console.log('Logging out from WhatsApp client...');
      if (this.status === 'CONNECTED') {
        try {
          await this.client.logout();
        } catch (logoutErr: any) {
          console.warn('client.logout() failed, forcing destroy:', logoutErr.message);
          await this.client.destroy();
        }
      } else {
        await this.client.destroy();
      }
    } catch (destroyErr: any) {
      console.warn('Error during client logout/destroy:', destroyErr.message);
    } finally {
      this.status = 'DISCONNECTED';
      this.qrData = null;
      this.clientInfo = null;
      
      const authPath = path.join(process.cwd(), '.wwebjs_auth');
      deleteSingletonLocks(authPath);

      console.log('Re-creating WhatsApp Client after logout...');
      try {
        this.client.removeAllListeners();
      } catch (e) {}
      this.client = new Client(this.getClientOptions(authPath));
      this.setupListeners();
      
      this.initialize().catch(err => console.error('Failed to re-initialize after logout:', err));
    }
    return { success: true };
  }

  public async sendMessage(
    number: string,
    message: string,
    bypassRegCheck: boolean = false,
    mediaFile?: { path: string; mimetype: string; filename: string }
  ) {
    try {
      // Remove + and other chars, ensure suffix @c.us
      const chatId = number.replace(/\D/g, '') + '@c.us';
      
      if (!bypassRegCheck) {
        const isRegistered = await this.client.isRegisteredUser(chatId);
        if (!isRegistered) {
          return { success: false, reason: 'not_on_whatsapp' };
        }
      }

      if (mediaFile && fs.existsSync(mediaFile.path)) {
        const base64Data = fs.readFileSync(mediaFile.path, { encoding: 'base64' });
        const media = new MessageMedia(mediaFile.mimetype, base64Data, mediaFile.filename);
        await this.client.sendMessage(chatId, media, { caption: message });
      } else {
        await this.client.sendMessage(chatId, message);
      }
      return { success: true };
    } catch (err: any) {
      console.error(`Error sending to ${number}:`, err.message);
      return { success: false, reason: 'failed', error: err.message };
    }
  }
}
