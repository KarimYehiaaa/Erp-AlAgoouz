/**
 * electron/hardware/hardwareService.ts — خدمة العتاد الإنتاجية الموحدة (طابعات ودرج النقدية)
 * تفصل منطق المعالجة عن Electron IPC لتمكين الاختبار الحقيقي الصارم
 */
import { PosPrinterDriver, type ReceiptData } from './printer';

export interface PrinterDevice {
  name: string;
  isDefault?: boolean;
}

export interface HardwareContext {
  isDev: boolean;
  getPrintersAsync: () => Promise<PrinterDevice[]>;
  printFn?: (
    options: { silent: boolean; printBackground: boolean; deviceName: string },
    callback: (success: boolean, failureReason: string) => void
  ) => void;
}

export interface HardwareOperationResult {
  success: boolean;
  status: 'SUCCESS' | 'SIMULATED' | 'FAILED' | 'NOT_SUPPORTED';
  simulated: boolean;
  method?: string;
  target?: string;
  printer?: string;
  error?: string;
  message?: string;
}

/**
 * معالجة أمر فتح درج النقدية عبر نبضة ESC/POS أو محاكاة التطوير
 */
export async function handleOpenCashDrawer(
  printerNameOrIp: string | undefined,
  context: HardwareContext
): Promise<HardwareOperationResult> {
  const isDev = context.isDev;

  // 1. Network IP Receipt Printer via raw TCP 9100 ESC/POS
  const isIpAddress = !!printerNameOrIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(printerNameOrIp);
  if (isIpAddress) {
    try {
      const pulseBuffer = PosPrinterDriver.getDrawerKickCommand();
      const networkSent = await PosPrinterDriver.printNetworkRaw(printerNameOrIp, 9100, pulseBuffer);
      if (networkSent) {
        return {
          success: true,
          status: 'SUCCESS',
          simulated: false,
          method: 'network_raw',
          target: printerNameOrIp,
          message: 'تم إرسال نبضة فتح درج النقدية بنجاح عبر طابعة الشبكة',
        };
      } else {
        return {
          success: false,
          status: 'FAILED',
          simulated: false,
          error: `تعذر إرسال أمر فتح الدرج لطابعة الشبكة (${printerNameOrIp}) على منفذ 9100`,
        };
      }
    } catch (err: any) {
      return { success: false, status: 'FAILED', simulated: false, error: err.message };
    }
  }

  // 2. Windows Driver / Local USB Printer
  try {
    const printers = await context.getPrintersAsync();

    if (!printers || printers.length === 0) {
      if (isDev) {
        return {
          success: true,
          status: 'SIMULATED',
          simulated: true,
          message: 'تمت محاكاة فتح الدرج (وضع التطوير بدون طابعات)',
        };
      }
      return {
        success: false,
        status: 'FAILED',
        simulated: false,
        error: 'لا توجد طابعة متصلة لإرسال نبضة فتح الدرج',
      };
    }

    const selectedPrinter = printerNameOrIp
      ? printers.find((p) => p.name === printerNameOrIp) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    if (isDev) {
      return {
        success: true,
        status: 'SIMULATED',
        simulated: true,
        printer: selectedPrinter.name,
        message: `تمت محاكاة إرسال نبضة فتح الدرج للطابعة: ${selectedPrinter.name}`,
      };
    }

    // In Production: Windows Spooler cannot send raw binary ESC/POS pulses to generic printers without raw pass-through driver.
    // Strictly return NOT_SUPPORTED rather than fake success!
    return {
      success: false,
      status: 'NOT_SUPPORTED',
      simulated: false,
      method: 'windows_driver',
      printer: selectedPrinter.name,
      error: `فتح درج النقدية المباشر عبر Windows Spooler للطابعة (${selectedPrinter.name}) غير مدعوم مباشرة؛ يرجى استخدام طابعة شبكية (IP 9100) أو ضبط درايفر الطابعة للفتح التلقائي عند الطباعة (Cash Drawer via Driver Settings).`,
    };
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: err.message };
  }
}

/**
 * معالجة أمر طباعة الإيصال الحراري عبر طابعة شبكية أو Windows Spooler
 */
export async function handlePrintReceipt(
  invoiceData: any,
  printerNameOrIp: string | undefined,
  context: HardwareContext
): Promise<HardwareOperationResult> {
  const isDev = context.isDev;

  // 1. Network IP receipt printer support
  const isIpAddress = !!printerNameOrIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(printerNameOrIp);
  if (isIpAddress) {
    try {
      const receiptText = PosPrinterDriver.generateTextReceipt(invoiceData);
      const receiptBuffer = Buffer.concat([
        Buffer.from(receiptText, 'utf8'),
        PosPrinterDriver.getPaperCutCommand(),
      ]);
      const sent = await PosPrinterDriver.printNetworkRaw(printerNameOrIp, 9100, receiptBuffer);
      if (sent) {
        return {
          success: true,
          status: 'SUCCESS',
          simulated: false,
          method: 'network_raw',
          target: printerNameOrIp,
          message: 'تمت الطباعة الحرارية عبر طابعة الشبكة بنجاح',
        };
      } else {
        return {
          success: false,
          status: 'FAILED',
          simulated: false,
          error: `فشلت الطباعة عبر طابعة الشبكة (${printerNameOrIp})`,
        };
      }
    } catch (err: any) {
      return { success: false, status: 'FAILED', simulated: false, error: err.message };
    }
  }

  // 2. Windows Spooler / WebContents print
  try {
    const printers = await context.getPrintersAsync();

    if (!printers || printers.length === 0) {
      if (isDev) {
        return {
          success: true,
          status: 'SIMULATED',
          simulated: true,
          message: 'تمت محاكاة طباعة الإيصال بنجاح (وضع التطوير)',
        };
      }
      return { success: false, status: 'FAILED', simulated: false, error: 'لا توجد طابعة متصلة بالنظام' };
    }

    const selectedPrinter = printerNameOrIp
      ? printers.find((p) => p.name === printerNameOrIp) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    if (isDev && !context.printFn) {
      return {
        success: true,
        status: 'SIMULATED',
        simulated: true,
        printer: selectedPrinter.name,
        message: `تمت محاكاة طباعة الإيصال بنجاح للطابعة (${selectedPrinter.name})`,
      };
    }

    if (!context.printFn) {
      return {
        success: false,
        status: 'FAILED',
        simulated: false,
        error: 'محرك الطباعة عبر نظام التشغيل غير متاح',
      };
    }

    return new Promise((resolve) => {
      context.printFn!(
        {
          silent: true,
          printBackground: true,
          deviceName: selectedPrinter.name,
        },
        (success, failureReason) => {
          if (success) {
            resolve({
              success: true,
              status: 'SUCCESS',
              simulated: false,
              method: 'windows_spooler',
              printer: selectedPrinter.name,
            });
          } else {
            resolve({
              success: false,
              status: 'FAILED',
              simulated: false,
              error: failureReason || 'فشلت عملية الطباعة عبر Windows Spooler',
            });
          }
        }
      );
    });
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: err.message };
  }
}
