import * as XLSX_ORIG from 'xlsx';
import path from 'path';

// Handle CommonJS package default export vs namespace export in Node ESM
const XLSX = (XLSX_ORIG.readFile ? XLSX_ORIG : (XLSX_ORIG as any).default || XLSX_ORIG) as typeof XLSX_ORIG;

export interface Contact {
  phone_number: string;
  name: string;
  custom_message: string;
  status?: string;
  rowNumber: number;
  [key: string]: any;
}

export class ExcelHandler {
  private filePath: string;
  private workbook: XLSX_ORIG.WorkBook;
  private sheetName: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.workbook = XLSX.readFile(filePath);
    this.sheetName = this.workbook.SheetNames[0];
  }

  public getHeaders(): string[] {
    const worksheet = this.workbook.Sheets[this.sheetName];
    if (!worksheet || !worksheet['!ref']) return ['status'];
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; ++c) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
      if (cell && cell.v !== undefined) {
        headers.push(String(cell.v).trim());
      }
    }
    
    if (headers.length === 0) {
      return ['mobile_whatsapp_number', 'name', 'custom_message', 'status'];
    }

    const hasMsg = headers.some(h => {
      const hL = h.toLowerCase();
      return hL === 'custom_message' || hL === 'message' || hL === 'text' || hL === 'custom_message_body' || hL === 'personalized_message' || hL === 'msg' || hL === 'message_text' || hL === 'messagetext';
    });
    
    if (!hasMsg) {
      headers.push('custom_message');
    }
    
    return headers;
  }

  public static parseRow(row: any): { phone_number: string, name: string, custom_message: string, status: string } {
    const getVal = (keys: string[]): any => {
      for (const k of keys) {
        if (row[k] !== undefined) return row[k];
        const normalizedKn = k.toLowerCase().replace(/[\s\-\_]/g, '');
        for (const rk of Object.keys(row)) {
          const normalizedRk = rk.toLowerCase().replace(/[\s\-\_]/g, '');
          if (normalizedRk === normalizedKn) {
            return row[rk];
          }
        }
      }
      return undefined;
    };

    const phone_val = getVal([
      'phone_number', 'mobile_number', 'whatsapp_number', 'phone', 'mobile', 'whatsapp', 
      'mobile_whatsapp_number', 'mobilenumber', 'mobileno', 'mobile_no', 'phoneno', 
      'phone_no', 'contact', 'contact_number', 'contact_no', 'contactno', 'whatsapp_no', 
      'whatsappno', 'number', 'tel', 'cell', 'cell_number', 'cell_no', 'cellno'
    ]);
    const name_val = getVal([
      'name', 'recipient_name', 'recipient', 'customer_name', 'customer', 'contact_name', 
      'contactname', 'client', 'client_name', 'first_name', 'firstname', 'full_name', 
      'fullname', 'to_name', 'toname'
    ]);
    const msg_val = getVal([
      'custom_message', 'message', 'text', 'custom_message_body', 'personalized_message', 
      'msg', 'message_text', 'messagetext'
    ]);
    const status_val = getVal(['status']);

    return {
      phone_number: phone_val !== undefined ? String(phone_val).trim() : '',
      name: name_val !== undefined ? String(name_val).trim() : '',
      custom_message: msg_val !== undefined ? String(msg_val).trim() : '',
      status: status_val !== undefined ? String(status_val).trim() : ''
    };
  }

  public readContacts(defaultCountryCode?: string): Contact[] {
    const worksheet = this.workbook.Sheets[this.sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row, index) => {
      const parsed = ExcelHandler.parseRow(row);
      return {
        ...row,
        phone_number: this.normalizePhone(parsed.phone_number, defaultCountryCode),
        name: parsed.name || 'Friend',
        custom_message: parsed.custom_message,
        status: parsed.status || undefined,
        rowNumber: index + 2 // 1-indexed + header row
      };
    }).filter(c => c.status?.trim() !== 'sent');
  }

  public resetAllStatuses() {
    const worksheet = this.workbook.Sheets[this.sheetName];
    if (!worksheet || !worksheet['!ref']) return;
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    
    let statusColIndex = 3;
    for (let c = 0; c <= range.e.c; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell && cell.v === 'status') {
        statusColIndex = c;
        break;
      }
    }

    for (let r = 1; r <= range.e.r; r++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c: statusColIndex });
      worksheet[cellAddress] = { t: 's', v: '' };
    }
    
    XLSX.writeFile(this.workbook, this.filePath);
  }

  public updateStatus(rowNumber: number, status: string) {
    const worksheet = this.workbook.Sheets[this.sheetName];
    
    // Find current headers to be sure
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    let statusColIndex = 3;
    for (let c = 0; c <= range.e.c; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell && cell.v === 'status') {
        statusColIndex = c;
        break;
      }
    }

    const targetCell = XLSX.utils.encode_cell({ r: rowNumber - 1, c: statusColIndex });
    worksheet[targetCell] = { t: 's', v: status };
  }

  public flush() {
    XLSX.writeFile(this.workbook, this.filePath);
  }

  public normalizePhone(phone: any, defaultCountryCode?: string): string {
    if (!phone) return '';
    let cleaned = String(phone).trim();
    if (cleaned.endsWith('.0')) {
      cleaned = cleaned.slice(0, -2);
    }
    
    cleaned = cleaned.replace(/\D/g, ''); // Keep only digits
    
    let activeCountryCode = defaultCountryCode || '';
    
    // Auto-fallback: If no country code is specified and it's a 10-digit Indian number, default to '91'
    if (!activeCountryCode && cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      activeCountryCode = '91';
    }
    
    if (activeCountryCode) {
      const codeOnly = activeCountryCode.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1);
      }
      
      // If the number doesn't already start with the default country code, prepend it.
      if (codeOnly && !cleaned.startsWith(codeOnly) && cleaned.length >= 7 && cleaned.length <= 11) {
        cleaned = codeOnly + cleaned;
      }
    }
    
    return cleaned;
  }

  public getSummary() {
    const worksheet = this.workbook.Sheets[this.sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);
    const summary = {
      total: data.length,
      sent: data.filter(r => r.status === 'sent').length,
      failed: data.filter(r => r.status === 'failed').length,
      not_on_whatsapp: data.filter(r => r.status === 'not_on_whatsapp').length,
      pending: data.filter(r => !r.status).length
    };
    return summary;
  }
}
