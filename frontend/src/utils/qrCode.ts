/**
 * utils/qrCode.ts — أداة مساعدة لتوليد أكواد الـ QR Code
 * ══════════════════════════════════════════════════════
 */
import QRCode from 'qrcode';

export interface QrOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * توليد كود الـ QR كصورة Base64 DataURL
 */
export async function generateQrDataUrl(text: string, options: QrOptions = {}): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: options.width || 300,
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: options.darkColor || '#23140c',
        light: options.lightColor || '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR Code DataURL:', err);
    return '';
  }
}

/**
 * توليد كود الـ QR كـ SVG String
 */
export async function generateQrSvg(text: string, options: QrOptions = {}): Promise<string> {
  try {
    const svgString = await QRCode.toString(text, {
      type: 'svg',
      width: options.width || 300,
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: options.darkColor || '#23140c',
        light: options.lightColor || '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    return svgString;
  } catch (err) {
    console.error('Failed to generate QR Code SVG:', err);
    return '';
  }
}

/**
 * تحميل صورة الـ QR Code مباشرة على جهاز المستخدم
 */
export function downloadQrImage(dataUrl: string, filename: string = 'menu-qr-code.png') {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
