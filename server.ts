import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { execSync } from 'child_process';
import os from 'os';

declare global {
  var isCampaignRunning: boolean;
  var campaignController: { cancelled: boolean };
}

import * as XLSX_ORIG from 'xlsx';

// Handle CommonJS package default export vs namespace export in Node ESM
const XLSX = (XLSX_ORIG.readFile ? XLSX_ORIG : (XLSX_ORIG as any).default || XLSX_ORIG) as typeof XLSX_ORIG;

// Modules
import { WhatsAppClient } from './server/whatsappClient.js';
import { ExcelHandler } from './server/excelHandler.js';
import { RateLimiter } from './server/rateLimiter.js';
import { Logger } from './server/logger.js';

const resolvedDirname = (typeof import.meta !== 'undefined' && import.meta.url)
  ? path.dirname(fileURLToPath(import.meta.url))
  : (typeof __dirname !== 'undefined' ? __dirname : process.cwd());

async function ensureLocalWaVersion() {
  const localCachePath = path.join(process.cwd(), 'wa-version-2.3000.1039994644-alpha.html');
  if (!fs.existsSync(localCachePath)) {
    try {
      console.log('Syncing WhatsApp Web local caching template for offline integrity...');
      const response = await fetch('https://unpkg.com/@wppconnect/wa-version@1.5.3990/html/2.3000.1039994644-alpha.html', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (response.ok) {
        const text = await response.text();
        fs.writeFileSync(localCachePath, text);
        console.log('Local WhatsApp HTML cache successfully written for offline/firewall bypass.');
      } else {
        console.warn(`Local WhatsApp cache preparation returned HTTP error status: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`Local WhatsApp HTML cache failed to download (this is normal if completely offline):`, err.message);
    }
  }
}

async function startServer() {
  try {
    await ensureLocalWaVersion();
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    console.log('Starting server in', process.env.NODE_ENV || 'development', 'mode...');
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({
      contentSecurityPolicy: false,
      frameguard: false,
    }));
    const httpServer = createServer(app);
    const io = new Server(httpServer);
    const PORT = Number(process.env.PORT || 3000);

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/');
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
      }
    });

    const upload = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel'
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' || !allowed.includes(file.mimetype)) {
          return cb(new Error('Only .xlsx files are allowed'));
        }
        cb(null, true);
      }
    });

    const uploadMedia = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        const ALLOWED_MEDIA_TYPES = [
          'image/', 'video/', 'audio/',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!ALLOWED_MEDIA_TYPES.some(t => file.mimetype.startsWith(t))) {
          return cb(new Error('Unsupported file type. Allowed: images, video, audio, PDF, Word docs'));
        }
        cb(null, true);
      }
    });

    let API_SECRET = process.env.API_SECRET;
    if (!API_SECRET) {
      if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/^API_SECRET=(.+)$/m);
        if (match) {
          API_SECRET = match[1].trim();
        }
      }
      if (!API_SECRET) {
        API_SECRET = crypto.randomUUID();
        try {
          fs.appendFileSync('.env', `\nAPI_SECRET=${API_SECRET}\n`);
        } catch (e) {
          // Ignore write failure (e.g. read-only filesystem)
        }
      }
      process.env.API_SECRET = API_SECRET;
    }

    console.log(`\n==================================================`);
    console.log(`🔑 API_SECRET (X-API-KEY): ${API_SECRET}`);
    console.log(`==================================================\n`);

    function checkDiskSpace(minMB = 100) {
      try {
        const out = execSync("df -m . | tail -1 | awk '{print $4}'").toString().trim();
        const freeMB = parseInt(out, 10);
        if (!isNaN(freeMB) && freeMB < minMB) {
          throw new Error(`Low disk space: ${freeMB}MB remaining (minimum ${minMB}MB required)`);
        }
      } catch (e: any) {
        if (e.message.includes('Low disk space')) {
          throw e;
        }
        console.warn(`Disk space check warning (ignored): ${e.message}`);
      }
    }

    function getLocalIpAddress() {
      try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          const iface = interfaces[name];
          if (iface) {
            for (const alias of iface) {
              if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
              }
            }
          }
        }
      } catch (e) {
        // ignore
      }
      return '127.0.0.1';
    }

    function isPrivateIp(ip: string): boolean {
      if (!ip) return false;
      let cleanIp = ip;
      // Handle IPv6 mapped IPv4 addresses
      if (ip.startsWith('::ffff:')) {
        cleanIp = ip.substring(7);
      }
      if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
        return true;
      }
      const parts = cleanIp.split('.');
      if (parts.length === 4) {
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        if (p1 === 10) return true;
        if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
        if (p1 === 192 && p2 === 168) return true;
      }
      return false;
    }

    const limiter = rateLimit({ windowMs: 60000, max: 500 });
    app.use('/api', limiter);

    function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
      const isPublic = 
        req.path === '/wa-version.html' || 
        req.path === '/health' ||
        req.path === '/bootstrap' ||
        req.path === '/local-ip' ||
        req.path === '/api/wa-version.html' ||
        req.path === '/api/health' ||
        req.path === '/api/bootstrap' ||
        req.path === '/api/local-ip' ||
        req.originalUrl === '/api/wa-version.html' ||
        req.originalUrl === '/api/health' ||
        req.originalUrl === '/api/bootstrap' ||
        req.originalUrl === '/api/local-ip';

      if (isPublic) {
        return next();
      }
      const key = req.headers['x-api-key'] || req.query.api_key;
      if (key !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    }

    app.use('/api', requireAuth);

    const logger = new Logger(io);
    
    // Reuse WhatsAppClient instance across HMR reloads to prevent port/file locks
    const globalAny = global as any;
    if (!globalAny.whatsappClientInstance) {
      globalAny.whatsappClientInstance = new WhatsAppClient();
    }
    const whatsapp: WhatsAppClient = globalAny.whatsappClientInstance;

    // Clear existing intervals/timeouts from previous HMR runs to prevent duplicates
    if (globalAny.whatsappHealthCheckInterval) clearInterval(globalAny.whatsappHealthCheckInterval);
    if (globalAny.whatsappStatusUpdateInterval) clearInterval(globalAny.whatsappStatusUpdateInterval);
    if (globalAny.whatsappInitTimeout) clearTimeout(globalAny.whatsappInitTimeout);
    if (globalAny.whatsappHeartbeatInterval) clearInterval(globalAny.whatsappHeartbeatInterval);

    // Bind isCampaignRunning and campaignController globally to survive reloads/HMR
    if (global.isCampaignRunning === undefined) {
      global.isCampaignRunning = false;
    }
    if (global.campaignController === undefined) {
      global.campaignController = { cancelled: false };
    } else {
      // Auto-cancel previous campaign run on HMR reload to prevent concurrent conflicts
      global.campaignController.cancelled = true;
      global.isCampaignRunning = false;
      console.log('[SYSTEM] HMR reload: Cancelled active background campaign to prevent collision.');
    }

    // Periodic WhatsApp Connection Health Check (Item 7)
    globalAny.whatsappHealthCheckInterval = setInterval(async () => {
      if (whatsapp.getStatus().status === 'CONNECTED') {
        try {
          if (whatsapp.client && typeof whatsapp.client.getState === 'function') {
            await whatsapp.client.getState();
          }
        } catch {
          logger.log('WhatsApp connection lost silently, attempting reconnect...', 'warning');
          whatsapp.softRefresh();
        }
      }
    }, 30000);

    // Immediately push the current status whenever a new browser tab/socket connects
    io.on('connection', (socket) => {
      try {
        socket.emit('whatsapp-status', { ...whatsapp.getStatus(), isCampaignRunning });
      } catch (err) {
        // Suppress connection-specific errors
      }
    });

    // Send status updates to clients periodically
    globalAny.whatsappStatusUpdateInterval = setInterval(() => {
      try {
        const currentStatus = whatsapp.getStatus();
        logger.emitStatus({ ...currentStatus, isCampaignRunning });
      } catch (err) {
        // Suppress interval errors
      }
    }, 2000);

    // API Routes
    app.get('/api/status', (req, res) => {
      res.json({ ...whatsapp.getStatus(), isCampaignRunning });
    });

    app.get('/api/bootstrap', (req, res) => {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      if (!isPrivateIp(clientIp)) {
        return res.status(403).json({ error: 'Access denied: Bootstrap info is only available within private local networks.' });
      }
      res.json({ apiKey: API_SECRET });
    });

    app.get('/api/local-ip', (req, res) => {
      res.json({ localIp: getLocalIpAddress(), port: PORT });
    });

    app.get('/api/wa-version.html', (req, res) => {
      const localCachePath = path.join(process.cwd(), 'wa-version-2.3000.1039994644-alpha.html');
      if (fs.existsSync(localCachePath)) {
        res.setHeader('Content-Type', 'text/html');
        return res.sendFile(localCachePath);
      }
      res.status(503).send('WhatsApp version file is initializing. Please retry in a few seconds.');
    });

    app.get('/api/template', (req, res) => {
      const customPath = 'uploads/custom_template.xlsx';
      if (req.query.custom === 'true' && fs.existsSync(customPath)) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=custom_whatsapp_template.xlsx');
        return res.sendFile(path.resolve(customPath));
      }

      const data = [
        ['mobile_whatsapp_number', 'name', 'custom_message'],
        ['1234567890', 'John Doe', 'Hello {name}, your order is ready!'],
        ['0987654321', 'Jane Smith', 'Hi {name}, welcome to our service.']
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=whatsapp_template.xlsx');
      res.send(buf);
    });

    function compileTemplate(template: string, contact: any): string {
      const fields = { ...contact };
      // Replace all placeholders in one pass using a single regex
      const message = template.replace(/\{(\w+)\}/gi, (_, key) => {
        const val = fields[key.toLowerCase()] ?? fields[key] ?? '';
        return String(val);
      });
      return message;
    }

    app.post('/api/save-template', express.json({ limit: '10mb' }), (req, res) => {
      const { contacts, headers: inputHeaders } = req.body;
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: 'Contacts must be an array' });
      }

      try {
        const headers = inputHeaders && inputHeaders.length > 0 
          ? inputHeaders 
          : ['mobile_whatsapp_number', 'name', 'custom_message', 'status'];
        
        if (!headers.includes('status')) {
          headers.push('status');
        }

        const rows = contacts.map(c => {
          return headers.map((h: string) => {
            if (c[h] !== undefined) return String(c[h]);
            if (h === 'mobile_whatsapp_number' || h === 'phone_number') return c.phone_number || '';
            if (h === 'name') return c.name || '';
            if (h === 'custom_message') return c.custom_message || '';
            if (h === 'status') return c.status || '';
            return '';
          });
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');

        const filePath = 'uploads/custom_template.xlsx';
        XLSX.writeFile(wb, filePath);

        const handler = new ExcelHandler(filePath);
        // We read all contacts including status if they are there, or read contacts filters pending ones
        // To let them view what was just saved, let's read the saved spreadsheet rows
        const worksheet = wb.Sheets[wb.SheetNames[0]];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet);

        const savedContacts = parsedRows.map((row, idx) => {
          const parsed = ExcelHandler.parseRow(row);
          return {
            ...row,
            phone_number: parsed.phone_number,
            name: parsed.name || 'Friend',
            custom_message: parsed.custom_message,
            status: parsed.status,
            rowNumber: idx + 2
          };
        });

        const summary = handler.getSummary();
        const activeHeaders = handler.getHeaders();

        res.json({
          message: 'Template saved successfully',
          contactsCount: savedContacts.length,
          contacts: savedContacts,
          headers: activeHeaders,
          summary,
          filePath: filePath
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to write Excel template', details: err.message });
      }
    });

    app.post('/api/upload', upload.single('file'), (req: any, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      try {
        const handler = new ExcelHandler(req.file.path);
        
        // We want to return all contacts in the sheet (including status) for the visual template editor
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet);
        
        const contacts = parsedRows.map((row, index) => {
          const parsed = ExcelHandler.parseRow(row);
          return {
            ...row,
            phone_number: parsed.phone_number,
            name: parsed.name || 'Friend',
            custom_message: parsed.custom_message,
            status: parsed.status,
            rowNumber: index + 2
          };
        });

        const summary = handler.getSummary();
        const activeHeaders = handler.getHeaders();
        
        res.json({ 
          message: 'File uploaded successfully', 
          contactsCount: contacts.length,
          contacts,
          headers: activeHeaders,
          summary,
          filePath: req.file.path
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to parse Excel file', details: err.message });
      }
    });

    app.use('/api/upload', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });

    app.post('/api/upload-media', uploadMedia.single('file'), (req: any, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No media file uploaded' });
      }
      try {
        res.json({
          message: 'Media uploaded successfully',
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          path: req.file.path
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to save media file', details: err.message });
      }
    });

    app.use('/api/upload-media', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });


    const StartBulkSchema = z.object({
      filePath: z.string().min(1),
      options: z.object({
        dryRun: z.boolean().optional(),
        limit: z.number().int().min(0).optional(),
        reset: z.boolean().optional(),
        bypassRegCheck: z.boolean().optional(),
        cooldown: z.number().int().min(0).optional(),
        batchSize: z.number().int().min(0).optional(),
        defaultCountryCode: z.string().max(4).optional(),
        template: z.string().max(4000).optional(),
        mediaFile: z.any().nullable().optional(),
        scheduledAt: z.string().optional(),
      }).optional()
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        whatsapp: whatsapp.getStatus().status,
        campaignRunning: isCampaignRunning,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/campaign-state', (req, res) => {
      if (fs.existsSync('campaign-state.json')) {
        try {
          const data = JSON.parse(fs.readFileSync('campaign-state.json', 'utf8'));
          return res.json({ hasSavedState: true, state: data });
        } catch (e) {
          return res.json({ hasSavedState: false });
        }
      }
      res.json({ hasSavedState: false });
    });

    app.post('/api/stop-bulk', (req, res) => {
      if (!isCampaignRunning) {
        return res.status(400).json({ error: 'No campaign is running' });
      }
      campaignController.cancelled = true;
      isCampaignRunning = false;
      res.json({ status: 'Stop signal sent' });
    });

    app.post('/api/start-bulk', express.json(), async (req: express.Request, res: express.Response) => {
      if (isCampaignRunning) {
        return res.status(409).json({ error: 'A campaign is already running' });
      }

      const parsed = StartBulkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload options', details: parsed.error.flatten() });
      }

      const { filePath, options } = parsed.data;
      const { dryRun = false, limit = 0, template = '', reset = false, defaultCountryCode = '', bypassRegCheck = false, cooldown = 0, batchSize = 0, mediaFile = null } = options || {};

      if (!filePath) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      const resolvedPath = path.resolve(filePath);
      const uploadsDir = path.resolve('uploads');
      if (!resolvedPath.startsWith(uploadsDir + path.sep)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ error: 'File not found' });
      }

      if (mediaFile && mediaFile.path) {
        const resolvedMedia = path.resolve(mediaFile.path);
        if (!resolvedMedia.startsWith(uploadsDir + path.sep)) {
          return res.status(400).json({ error: 'Invalid media file path' });
        }
      }

      // Check disk space before campaign start
      try {
        checkDiskSpace(100);
      } catch (diskErr: any) {
        return res.status(400).json({ error: diskErr.message });
      }

      isCampaignRunning = true; // set synchronously before async work
      res.json({ status: 'Processing started in background' });

      // Start in background with all options preserved
      campaignController = { cancelled: false };
      runBulkSender(resolvedPath, { dryRun, limit, template, reset, defaultCountryCode, bypassRegCheck, cooldown, batchSize, mediaFile, scheduledAt: options?.scheduledAt }, logger, whatsapp, campaignController);
    });

    app.post('/api/logout', async (req: express.Request, res: express.Response) => {
      try {
        await whatsapp.logout();
        res.json({ success: true, message: 'Disconnected and session reset' });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to disconnect session', details: err.message });
      }
    });

    app.post('/api/reset-client', async (req: express.Request, res: express.Response) => {
      try {
        const result = await whatsapp.forceReset();
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to execute hard reset', details: err.message });
      }
    });

    app.post('/api/refresh-client', async (req: express.Request, res: express.Response) => {
      try {
        const result = await whatsapp.softRefresh();
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to execute soft refresh', details: err.message });
      }
    });

    async function sendWithRetry(whatsapp: WhatsAppClient, phone: string, message: string, bypass: boolean, mediaFile?: any, retries = 2) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const result = await whatsapp.sendMessage(phone, message, bypass, mediaFile);
        if (result.success || result.reason === 'not_on_whatsapp') return result;
        if (attempt < retries) {
          console.log(`[RETRY] Attempt ${attempt + 1} failed for ${phone}. Retrying in ${(attempt + 1) * 3} seconds...`);
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
      return { success: false, reason: 'failed_after_retries' };
    }

    // Bulk Sender Logic
    async function runBulkSender(filePath: string, options: any, logger: Logger, whatsapp: WhatsAppClient, controller: { cancelled: boolean }) {
      io.emit('campaign-status', { running: true });
      const campaignId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      let totalContacts = 0;
      let successCount = 0;
      let failCount = 0;

      try {
        const handler = new ExcelHandler(filePath);
        if (options.reset) {
          logger.log(`[${campaignId}] Resetting all delivery statuses for clean broadcast...`, 'info');
          handler.resetAllStatuses();
        }

        const defaultCountryCode = options.defaultCountryCode || '';
        let contacts = handler.readContacts(defaultCountryCode);

        // Deduplicate contacts if duplicate numbers exist (Item 10)
        const seen = new Set<string>();
        const originalCount = contacts.length;
        contacts = contacts.filter(c => {
          if (seen.has(c.phone_number)) return false;
          seen.add(c.phone_number);
          return true;
        });
        if (contacts.length < originalCount) {
          logger.log(`[${campaignId}] Deduplicated contacts: removed ${originalCount - contacts.length} duplicates.`, 'info');
        }

        if (options.limit > 0) {
          contacts = contacts.slice(0, options.limit);
        }

        totalContacts = contacts.length;

        // Max campaign size guard (Item 11)
        const MAX_CONTACTS = 500;
        if (contacts.length > MAX_CONTACTS) {
          throw new Error(`Campaign too large: ${contacts.length} contacts (max limit is ${MAX_CONTACTS})`);
        }

        // Scheduled Campaigns (Item 17)
        if (options.scheduledAt) {
          const scheduledTime = new Date(options.scheduledAt);
          if (isNaN(scheduledTime.getTime())) {
            throw new Error(`Invalid scheduledAt date: "${options.scheduledAt}"`);
          }
          const delay = scheduledTime.getTime() - Date.now();
          if (delay <= 0) {
            throw new Error(`Scheduled time is in the past (${options.scheduledAt})`);
          }

          logger.log(`[${campaignId}] Campaign is scheduled. Waiting for ${Math.round(delay / 1000)}s until launch (${options.scheduledAt})...`, 'info');
          const checkInterval = 1000;
          let elapsed = 0;
          while (elapsed < delay) {
            if (controller.cancelled) {
              logger.log(`[${campaignId}] Campaign cancelled by user during scheduling delay.`, 'warning');
              return;
            }
            await new Promise(r => setTimeout(r, checkInterval));
            elapsed += checkInterval;
          }
        }

        logger.log(`[${campaignId}] Starting bulk send to ${contacts.length} contacts...`, 'info');
        logger.updateProgress(0, contacts.length);

        for (let i = 0; i < contacts.length; i++) {
          if (controller.cancelled) {
            logger.log(`[${campaignId}] Campaign cancelled by user.`, 'warning');
            break;
          }

          const contact = contacts[i];
          
          let personalizedMessage = '';
          if (options.template) {
            personalizedMessage = compileTemplate(options.template, contact);
          } else {
            personalizedMessage = compileTemplate(contact.custom_message || '', contact);
          }

          logger.log(`[${campaignId}] [${i+1}/${contacts.length}] Processing ${contact.name} (${contact.phone_number})...`);

          // Save campaign progress state (Item 6)
          try {
            fs.writeFileSync('campaign-state.json', JSON.stringify({
              campaignId,
              filePath,
              currentIndex: i,
              timestamp: Date.now(),
              options,
              contactsCount: contacts.length
            }));
          } catch (e) {}

          if (options.dryRun) {
            logger.log(`[${campaignId}] DRY RUN: Would send to ${contact.phone_number}: "${personalizedMessage}"`, 'warning');
            handler.updateStatus(contact.rowNumber, 'dry_run');
            successCount++;
          } else {
            const result = await sendWithRetry(whatsapp, contact.phone_number, personalizedMessage, !!options.bypassRegCheck, options.mediaFile);
            
            if (result.success) {
              logger.log(`[${campaignId}] Successfully sent to ${contact.name} (${contact.phone_number})`, 'success');
              handler.updateStatus(contact.rowNumber, 'sent');
              successCount++;
            } else {
              logger.log(`[${campaignId}] Failed to send to ${contact.name} (${contact.phone_number}): ${result.reason}`, 'error');
              handler.updateStatus(contact.rowNumber, result.reason || 'failed');
              failCount++;
            }
          }

          if ((i + 1) % 10 === 0) {
            handler.flush();
          }

          logger.updateProgress(i + 1, contacts.length);

          // Rate Limiting
          if (i < contacts.length - 1) {
            const cooldownSec = options.cooldown !== undefined ? Number(options.cooldown) : 0;
            const bSize = options.batchSize !== undefined ? Number(options.batchSize) : 0;

            if (bSize > 0 && (i + 1) % bSize === 0) {
              logger.log(`[${campaignId}] Batch reached: ${i + 1} messages sent. Pausing for 3 to 5 minutes...`, 'warning');
              await RateLimiter.pause(3, 5);
            } else if (cooldownSec > 0) {
              logger.log(`[${campaignId}] Waiting ${cooldownSec} seconds cooldown delay...`, 'info');
              await RateLimiter.randomDelay(cooldownSec, cooldownSec);
            } else {
              // Minimum floor to avoid WhatsApp anti-spam detection
              await RateLimiter.randomDelay(1, 3);
            }
          }
        }

        handler.flush(); // final write

        const summary = handler.getSummary();
        logger.log(`[${campaignId}] Process finished. Summary: Sent: ${summary.sent}, Failed: ${summary.failed}`, 'success');
      } catch (err: any) {
        logger.log(`[${campaignId}] Critical error in bulk sender: ${err.message}`, 'error');
      } finally {
        isCampaignRunning = false;
        controller.cancelled = false;

        // Clean up Excel and media files after campaign finishes
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          if (options.mediaFile && options.mediaFile.path && fs.existsSync(options.mediaFile.path)) {
            fs.unlinkSync(options.mediaFile.path);
          }
        } catch (e) {}

        // Remove the campaign progress state file (Item 6)
        try {
          if (fs.existsSync('campaign-state.json')) {
            fs.unlinkSync('campaign-state.json');
          }
        } catch (e) {}

        // Append to campaign audit trail file (Item 13)
        try {
          fs.appendFileSync('campaigns.jsonl', JSON.stringify({
            campaignId,
            startedAt,
            finishedAt: new Date().toISOString(),
            total: totalContacts,
            sent: successCount,
            failed: failCount,
            filePath,
            dryRun: !!options.dryRun
          }) + '\n');
        } catch (auditErr: any) {
          console.error('Audit logging failed:', auditErr.message);
        }

        io.emit('campaign-status', { running: false });
        logger.emitStatus({ ...whatsapp.getStatus(), isCampaignRunning: false });
      }
    }

    // Global API Error Handler
    app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('[API Global Error]', err);
      if (res.headersSent) {
        return next(err);
      }
      res.status(err.status || err.statusCode || 500).json({
        error: err.message || 'An unexpected API error occurred',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    });

    // Vite middleware
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      
      app.get('*', async (req, res, next) => {
        if (req.originalUrl.startsWith('/api')) return next();
        try {
          const template = fs.readFileSync(path.resolve(resolvedDirname, 'index.html'), 'utf-8');
          const html = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } catch (e) {
          next(e);
        }
      });
    } else {
      const distPath = resolvedDirname;
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
      const localNetworkIp = getLocalIpAddress();
      console.log(`\n==================================================`);
      console.log(`  🚀 Server is running and listening at:`);
      console.log(`  👉 Localhost: http://localhost:${PORT}`);
      console.log(`  👉 Loopback:  http://127.0.0.1:${PORT}`);
      console.log(`  👉 Network:   http://${localNetworkIp}:${PORT}`);
      console.log(`==================================================\n`);
      
      // Pulse to verify logging is visible
      globalAny.whatsappHeartbeatInterval = setInterval(() => {
        console.log(`Heartbeat: whatsapp status is ${whatsapp.getStatus().status}`);
      }, 30000);

      // Defer WhatsApp client initialization to avoid resource spikes on container boot
      console.log('Scheduling WhatsApp Client initialization in 15 seconds...');
      globalAny.whatsappInitTimeout = setTimeout(() => {
        console.log('Initializing WhatsApp Client...');
        whatsapp.initialize().catch(err => {
          console.error('WhatsApp Init Error:', err);
        });
      }, 15000);
    });

    // Handle graceful process shutdown to save Puppeteer session files and locks safely to disk on exit
    let isShuttingDown = false;
    const cleanShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[PROCESS] Received signal ${signal}. Starting clean shutdown...`);
      try {
        if (whatsapp && whatsapp.client) {
          console.log('[PROCESS] Destroying active WhatsApp client and closing browser...');
          await whatsapp.client.destroy();
          console.log('[PROCESS] WhatsApp Puppeteer session flushed and closed cleanly.');
        }
      } catch (err: any) {
        console.error('[PROCESS] Error during WhatsApp cleanup on exit:', err.message);
      } finally {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => cleanShutdown('SIGINT'));
    process.on('SIGTERM', () => cleanShutdown('SIGTERM'));

  } catch (error) {
    console.error('FATAL SERVER STARTUP ERROR:', error);
  }
}

// Global process error handlers to prevent async crashes (such as unexpected Puppeteer target closures) from terminating the backend server
process.on('unhandledRejection', (reason, promise) => {
  console.error('[GLOBAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[GLOBAL] Uncaught Exception thrown:', err);
});

startServer();
