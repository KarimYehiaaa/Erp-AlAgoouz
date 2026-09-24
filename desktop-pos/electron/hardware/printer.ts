/**
 * electron/hardware/printer.ts — محرك الطباعة الحرارية المباشرة والتحكم في درج النقدية
 * يدعم: ESC/POS 80mm & 58mm، قص الورق التلقائي، وفتح الدرج
 */
import net from 'net';

export interface ReceiptItem {
  name_ar: string;
  quantity: number;
  unit_price: number;
  total_amount?: number;
  custom_notes?: string;
}

export interface ReceiptData {
  company_name?: string;
  shop_name?: string;
  terminal_code?: string;
  invoice_number: string;
  cashier_name?: string;
  date_time: string;
  items: ReceiptItem[];
  subtotal: number;
  discount_amount?: number;
  total_amount: number;
  payment_method: string;
  cash_given?: number;
  change_due?: number;
  notes?: string;
}

export interface ZReportData {
  shift_number: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  total_sales: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_deposits: number;
  total_withdrawals: number;
  expected_cash: number;
  actual_cash: number;
  cash_difference: number;
  invoices_count: number;
}

export class PosPrinterDriver {
  /**
   * توليد أوامر ESC/POS المباشرة لفتح درج النقدية
   */
  static getDrawerKickCommand(): Buffer {
    // ESC p 0 25 250 (Pin 2 kick pulse)
    return Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  }

  /**
   * توليد أوامر ESC/POS لقص الورق
   */
  static getPaperCutCommand(): Buffer {
    // GS V 66 0 (Feed and cut)
    return Buffer.from([0x1d, 0x56, 0x42, 0x00]);
  }

  /**
   * إرسال أوامر الطباعة إلى طابعة شبكية عبر منفذ TCP Socket (Port 9100)
   */
  static async printNetworkRaw(ip: string, port = 9100, buffer: Buffer): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(3000);

      client.connect(port, ip, () => {
        client.write(buffer, () => {
          client.end();
          resolve(true);
        });
      });

      client.on('error', (err) => {
        console.error('[Printer] Network printer error:', err);
        client.destroy();
        resolve(false);
      });

      client.on('timeout', () => {
        console.error('[Printer] Network printer timeout');
        client.destroy();
        resolve(false);
      });
    });
  }

  /**
   * إنشاء كود طباعة نصي مبسط للإيصالات الحرارية
   */
  static generateTextReceipt(data: ReceiptData): string {
    const divider = '------------------------------------------------';
    const doubleDivider = '================================================';

    let receipt = '\n';
    receipt += `${data.company_name || 'بن العجوز للقهوة'}\n`;
    receipt += `${data.shop_name || 'المحل الرئيسي'} | ${data.terminal_code || 'TRM-01'}\n`;
    receipt += `${doubleDivider}\n`;
    receipt += `رقم الفاتورة: ${data.invoice_number}\n`;
    receipt += `التاريخ: ${data.date_time}\n`;
    receipt += `الكاشير: ${data.cashier_name || 'الكاشير'}\n`;
    receipt += `${divider}\n`;
    receipt += `الصنف                  الكمية    السعر     الإجمالي\n`;
    receipt += `${divider}\n`;

    for (const item of data.items) {
      const lineTotal = item.quantity * item.unit_price;
      receipt += `${item.name_ar.padEnd(20)} ${String(item.quantity).padStart(5)} ${item.unit_price.toFixed(2).padStart(8)} ${lineTotal.toFixed(2).padStart(10)}\n`;
      if (item.custom_notes) {
        receipt += `   * ${item.custom_notes}\n`;
      }
    }

    receipt += `${divider}\n`;
    receipt += `المجموع الفرعي: ${data.subtotal.toFixed(2)} ج.م\n`;
    if (data.discount_amount && data.discount_amount > 0) {
      receipt += `الخصم: ${data.discount_amount.toFixed(2)} ج.م\n`;
    }
    receipt += `الإجمالي النهائي: ${data.total_amount.toFixed(2)} ج.م\n`;
    const paymentLabel =
      data.payment_method === 'cash'
        ? 'نقدي'
        : data.payment_method === 'card'
          ? 'بطاقة'
          : data.payment_method === 'instapay'
            ? 'إنستاباي'
            : 'آجل';
    receipt += `طريقة الدفع: ${paymentLabel}\n`;

    if (data.payment_method === 'cash' && data.cash_given) {
      receipt += `المستلم: ${data.cash_given.toFixed(2)} ج.م | الباقي: ${(data.change_due || 0).toFixed(2)} ج.م\n`;
    }

    receipt += `${doubleDivider}\n`;
    receipt += `شكراً لزيارتكم بن العجوز!\n\n\n`;

    return receipt;
  }
}
