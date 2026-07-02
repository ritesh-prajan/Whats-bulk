import { Server } from 'socket.io';

export class Logger {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  public log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    this.io.emit('log', { message, type, timestamp: new Date().toISOString() });
  }

  public updateProgress(current: number, total: number) {
    this.io.emit('progress', { current, total });
  }

  public emitStatus(status: any) {
    this.io.emit('whatsapp-status', status);
  }
}
