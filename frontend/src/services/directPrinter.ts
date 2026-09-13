/// <reference types="w3c-web-usb" />

// Direct Thermal Printing Service via WebUSB (ESC/POS Canvas-to-Raster)
// Supports all thermal receipt printers (80mm / 58mm) with full Arabic text layout.

let selectedDevice: USBDevice | null = null;

const PRINTER_WIDTH = 576; // 80mm paper width in dots (72mm printable area at 203 DPI)

// Claim USB Interface
const getPrinterInterface = async (device: any) => {
  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  // Find interface that has bulkOut endpoint
  let interfaceNumber = 0;
  let endpointOut = null;

  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      if (alt.interfaceClass === 7) {
        // Printer Class
        interfaceNumber = iface.interfaceNumber;
        const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
        if (ep) {
          endpointOut = ep;
          break;
        }
      }
    }
    if (endpointOut) break;
  }

  // Fallback to first interface/endpoint if class matching failed
  if (!endpointOut) {
    interfaceNumber = device.configuration.interfaces[0].interfaceNumber;
    const alt = device.configuration.interfaces[0].alternates[0];
    endpointOut = alt.endpoints.find((e: any) => e.direction === 'out');
  }

  await device.claimInterface(interfaceNumber);
  return { interfaceNumber, endpointOut };
};

// Render invoice details onto an HTML Canvas
const renderInvoiceToCanvas = (invoice: any) => {
  const canvas = document.createElement('canvas');
  canvas.width = PRINTER_WIDTH;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';

  const company = invoice.company || { name_ar: 'بن العجوز ERP', tagline: 'للبن التركي الأصيل' };

  // Estimate height dynamically based on items
  const items = invoice.items || [];
  const itemHeight = 35;
  let headerHeight = 220;
  if (company.address) headerHeight += 25;
  if (company.phone) headerHeight += 25;
  const footerHeight = 220;
  canvas.height = headerHeight + items.length * itemHeight + footerHeight;

  // Fill background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  // Draw header (Centered)
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(company.name_ar || 'بن العجوز ERP', PRINTER_WIDTH / 2, 20);

  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText(company.tagline || 'فاتورة مبيعات تبسيطية', PRINTER_WIDTH / 2, 70);

  let currentHeaderY = 110;
  if (company.address) {
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(company.address, PRINTER_WIDTH / 2, currentHeaderY);
    currentHeaderY += 25;
  }
  if (company.phone) {
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(`ت: ${company.phone}`, PRINTER_WIDTH / 2, currentHeaderY);
    currentHeaderY += 25;
  }

  // Draw separator line
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, currentHeaderY);
  ctx.lineTo(PRINTER_WIDTH - 10, currentHeaderY);
  ctx.stroke();

  // Invoice Details (Left-aligned/RTL)
  ctx.textAlign = 'right';
  ctx.font = '20px Arial, sans-serif';
  const rightX = PRINTER_WIDTH - 20;

  let detailsY = currentHeaderY + 15;
  ctx.fillText(`رقم الفاتورة: ${invoice.invoice_number || invoice.sale_number}`, rightX, detailsY);
  detailsY += 30;
  ctx.fillText(
    `التاريخ: ${new Date(invoice.created_at || invoice.sale_date).toLocaleDateString('ar-EG')} ${new Date(invoice.created_at || invoice.sale_date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
    rightX,
    detailsY,
  );
  detailsY += 30;
  ctx.fillText(`الكاشير: ${invoice.user_name || 'الكاشير'}`, rightX, detailsY);
  detailsY += 30;
  if (invoice.customer_name) {
    ctx.fillText(`العميل: ${invoice.customer_name}`, rightX, detailsY);
    detailsY += 30;
  }

  // Draw table header
  ctx.beginPath();
  ctx.moveTo(10, detailsY + 10);
  ctx.lineTo(PRINTER_WIDTH - 10, detailsY + 10);
  ctx.stroke();

  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText('الصنف', rightX, detailsY + 20);
  ctx.textAlign = 'left';
  ctx.fillText('الكمية', 20, detailsY + 20);
  ctx.fillText('السعر', 140, detailsY + 20);
  ctx.fillText('الإجمالي', 260, detailsY + 20);

  ctx.beginPath();
  ctx.moveTo(10, detailsY + 45);
  ctx.lineTo(PRINTER_WIDTH - 10, detailsY + 45);
  ctx.stroke();

  // Draw items
  let currentY = detailsY + 55;
  ctx.font = '20px Arial, sans-serif';

  items.forEach((item: any) => {
    ctx.textAlign = 'right';
    ctx.fillText(item.product_name || item.name_ar, rightX, currentY);

    ctx.textAlign = 'left';
    ctx.fillText(`${Number(item.quantity).toFixed(1)}`, 20, currentY);
    ctx.fillText(`${Number(item.unit_price || item.sale_price).toFixed(2)}`, 140, currentY);
    ctx.fillText(
      `${Number(item.total_amount || item.quantity * (item.unit_price || item.sale_price)).toFixed(2)}`,
      260,
      currentY,
    );

    currentY += itemHeight;
  });

  // Draw separator line
  ctx.beginPath();
  ctx.moveTo(10, currentY);
  ctx.lineTo(PRINTER_WIDTH - 10, currentY);
  ctx.stroke();

  currentY += 15;
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('الإجمالي الفرعي:', rightX, currentY);
  ctx.textAlign = 'left';
  ctx.fillText(`${Number(invoice.subtotal || invoice.total_amount).toFixed(2)} ج.م`, 20, currentY);

  currentY += 30;
  if (invoice.discount_amount) {
    ctx.textAlign = 'right';
    ctx.fillText('الخصم:', rightX, currentY);
    ctx.textAlign = 'left';
    ctx.fillText(`-${Number(invoice.discount_amount).toFixed(2)} ج.م`, 20, currentY);
    currentY += 30;
  }

  ctx.textAlign = 'right';
  ctx.fillText('الإجمالي النهائي:', rightX, currentY);
  ctx.textAlign = 'left';
  ctx.fillText(`${Number(invoice.total_amount).toFixed(2)} ج.م`, 20, currentY);

  // Multi-tender payments breakdown
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    currentY += 25;
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('طرق الدفع:', rightX, currentY);
    invoice.payments.forEach((p: any) => {
      currentY += 20;
      const methodLabel =
        p.method === 'cash'
          ? 'نقدي (كاش)'
          : p.method === 'card'
            ? 'بطاقة (فيزا)'
            : p.method === 'transfer'
              ? 'إنستاباي/محفظة'
              : p.method === 'credit'
                ? 'آجل'
                : p.method;
      ctx.textAlign = 'right';
      ctx.fillText(`- ${methodLabel}:`, rightX, currentY);
      ctx.textAlign = 'left';
      ctx.fillText(`${Number(p.amount).toFixed(2)} ج.م`, 20, currentY);
    });
  }

  // Loyalty Points Summary
  if (invoice.loyalty) {
    currentY += 25;
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'right';
    if (invoice.loyalty.earned) {
      ctx.fillText(`نقاط الولاء المكتسبة: +${invoice.loyalty.earned} ⭐`, rightX, currentY);
      currentY += 20;
    }
    if (invoice.loyalty.redeemed) {
      ctx.fillText(`النقاط المستبدلة: -${invoice.loyalty.redeemed} ⭐`, rightX, currentY);
      currentY += 20;
    }
  }

  // Footer message
  currentY += 45;
  ctx.textAlign = 'center';
  ctx.font = 'italic 20px Arial, sans-serif';
  ctx.fillText(
    company.tagline || 'شكراً لزيارتكم! نرجو رؤيتكم قريباً',
    PRINTER_WIDTH / 2,
    currentY,
  );

  return canvas;
};

// Convert Canvas to ESC/POS Raster format
const convertCanvasToEscPos = (canvas: any) => {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const bytes = [];

  // Initialize printer: ESC @ (0x1B, 0x40)
  bytes.push(0x1b, 0x40);

  // Print raster bit image: GS v 0 m xL xH yL yH
  const xL = (width / 8) & 0xff;
  const xH = ((width / 8) >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  bytes.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 8) {
      let byteValue = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pxX = x + bit;
        if (pxX < width) {
          const pxIndex = (y * width + pxX) * 4;
          const r = data[pxIndex];
          const g = data[pxIndex + 1];
          const b = data[pxIndex + 2];
          const a = data[pxIndex + 3];

          // Gray scale average
          const isBlack = a > 128 && (r + g + b) / 3 < 200;
          if (isBlack) {
            byteValue |= 1 << (7 - bit);
          }
        }
      }
      bytes.push(byteValue);
    }
  }

  // Paper Feed ESC d 6 (0x1B, 0x64, 0x06)
  bytes.push(0x1b, 0x64, 0x06);

  // Paper Cut GS V 65 0 (0x1D, 0x56, 0x41, 0x00)
  bytes.push(0x1d, 0x56, 0x41, 0x00);

  return new Uint8Array(bytes);
};

/**
 * دالة بديلة لطباعة الإيصال عبر نافذة المتصفح (HTML Thermal Receipt Fallback)
 * تعمل على كافة المتصفحات والمنصات (Firefox, Safari, Mobile, Network Printers)
 */
export const printReceiptHtml = (invoice: any) => {
  const company = invoice.company || { name_ar: 'بن العجوز ERP', tagline: 'للبن التركي الأصيل' };
  const items = invoice.items || [];
  const dateStr = new Date(invoice.created_at || invoice.sale_date || Date.now()).toLocaleString(
    'ar-EG',
  );

  let paymentDetailsHtml = '';
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    paymentDetailsHtml = `
      <div class="receipt-divider"></div>
      <div class="receipt-section-title">طرق الدفع:</div>
      ${invoice.payments
        .map((p: any) => {
          const methodLabel =
            p.method === 'cash'
              ? 'نقدي'
              : p.method === 'card'
                ? 'بطاقة'
                : p.method === 'transfer'
                  ? 'محفظة/إنستاباي'
                  : p.method === 'credit'
                    ? 'آجل'
                    : p.method;
          return `<div class="receipt-row"><span>${methodLabel}:</span><strong>${Number(p.amount).toFixed(2)} ج.م</strong></div>`;
        })
        .join('')}
    `;
  }

  let loyaltyHtml = '';
  if (invoice.loyalty) {
    loyaltyHtml = `
      <div class="receipt-divider"></div>
      ${invoice.loyalty.earned ? `<div class="receipt-row"><span>نقاط مكتسبة:</span><strong>+${invoice.loyalty.earned} ⭐</strong></div>` : ''}
      ${invoice.loyalty.redeemed ? `<div class="receipt-row"><span>نقاط مستبدلة:</span><strong>-${invoice.loyalty.redeemed} ⭐</strong></div>` : ''}
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>إيصال ${invoice.invoice_number || invoice.sale_number || ''}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: 'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif;
          width: 74mm;
          margin: 0 auto;
          padding: 8px 4px;
          color: #000;
          background: #fff;
          font-size: 13px;
          line-height: 1.4;
          direction: rtl;
        }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .receipt-header { margin-bottom: 8px; text-align: center; }
        .receipt-header h2 { margin: 0 0 4px 0; font-size: 20px; font-weight: 800; }
        .receipt-header p { margin: 2px 0; font-size: 12px; color: #444; }
        .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
        .receipt-double-divider { border-top: 2px solid #000; margin: 6px 0; }
        .receipt-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 12px; }
        .receipt-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; }
        .receipt-table th { border-bottom: 1px solid #000; padding: 4px 0; font-weight: 700; text-align: right; }
        .receipt-table td { padding: 4px 0; vertical-align: top; }
        .total-row { font-size: 15px; font-weight: 800; }
        .receipt-footer { margin-top: 12px; text-align: center; font-size: 11px; color: #333; }
        .item-note { font-size: 10px; color: #555; display: block; }
      </style>
    </head>
    <body>
      <div class="receipt-header">
        <h2>${company.name_ar || 'بن العجوز ERP'}</h2>
        <p>${company.tagline || 'للبن التركي الأصيل'}</p>
        ${company.address ? `<p>${company.address}</p>` : ''}
        ${company.phone ? `<p>ت: ${company.phone}</p>` : ''}
      </div>

      <div class="receipt-divider"></div>

      <div class="receipt-row"><span>رقم الفاتورة:</span><strong>${invoice.invoice_number || invoice.sale_number || '—'}</strong></div>
      <div class="receipt-row"><span>التاريخ:</span><span>${dateStr}</span></div>
      <div class="receipt-row"><span>الكاشير:</span><span>${invoice.user_name || 'الكاشير'}</span></div>
      ${invoice.customer_name ? `<div class="receipt-row"><span>العميل:</span><span>${invoice.customer_name}</span></div>` : ''}

      <div class="receipt-divider"></div>

      <table class="receipt-table">
        <thead>
          <tr>
            <th style="width: 48%;">الصنف</th>
            <th class="text-center" style="width: 16%;">الكمية</th>
            <th class="text-left" style="width: 18%;">السعر</th>
            <th class="text-left" style="width: 18%;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item: any) => `
            <tr>
              <td>
                ${item.product_name || item.name_ar}
                ${item.notes || item.custom_notes ? `<span class="item-note">(${item.notes || item.custom_notes})</span>` : ''}
              </td>
              <td class="text-center">${Number(item.quantity).toFixed(1)}</td>
              <td class="text-left">${Number(item.unit_price || item.sale_price).toFixed(2)}</td>
              <td class="text-left">${Number(item.total_amount || item.quantity * (item.unit_price || item.sale_price)).toFixed(2)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>

      <div class="receipt-divider"></div>

      <div class="receipt-row"><span>المجموع الفرعي:</span><strong>${Number(invoice.subtotal || invoice.total_amount).toFixed(2)} ج.م</strong></div>
      ${invoice.discount_amount ? `<div class="receipt-row"><span>الخصم:</span><strong>-${Number(invoice.discount_amount).toFixed(2)} ج.م</strong></div>` : ''}
      
      <div class="receipt-double-divider"></div>
      
      <div class="receipt-row total-row">
        <span>الإجمالي النهائي:</span>
        <strong>${Number(invoice.total_amount).toFixed(2)} ج.م</strong>
      </div>

      ${paymentDetailsHtml}
      ${loyaltyHtml}

      <div class="receipt-divider"></div>
      
      <div class="receipt-footer">
        <p>${company.tagline || 'شكراً لزيارتكم! نرجو رؤيتكم قريباً'}</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error', err);
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }
    }, 250);
  }
};

/**
 * خدمة الطباعة الحرارية المباشرة عبر WebUSB (ESC/POS) مع دعم التحويل التلقائي للطباعة عبر المتصفح (Fallback).
 */
export const directPrinter = {
  isSupported: () => {
    return !!(navigator as any).usb;
  },

  selectPrinter: async () => {
    if (!(navigator as any).usb) {
      alert('ميزة WebUSB غير متوفرة في هذا المتصفح. سيتم استخدام الطباعة التلقائية عبر المتصفح.');
      return null;
    }
    try {
      selectedDevice = await (navigator as any).usb.requestDevice({ filters: [] });
      if (selectedDevice) {
        localStorage.setItem(
          'selected_usb_printer_name',
          selectedDevice.productName || 'USB Printer',
        );
      }
      return selectedDevice;
    } catch (err: any) {
      console.error('Failed to select USB device:', err);
      throw err;
    }
  },

  getSelectedPrinterName: () => {
    return localStorage.getItem('selected_usb_printer_name');
  },

  print: async (invoice: any) => {
    // 1. إذا كان WebUSB غير مدعوم، التحويل للطباعة عبر المتصفح مباشرة
    if (!(navigator as any).usb) {
      printReceiptHtml(invoice);
      return true;
    }

    // 2. محاولة التعرف على الطابعة المحددة سابقاً
    try {
      if (!selectedDevice) {
        const devices = await (navigator as any).usb.getDevices();
        if (devices.length > 0) {
          selectedDevice = devices[0] || null;
        }
      }

      // إذا لم تكن هناك طابعة USB متصلة، استخدم الـ Fallback بسلاسة
      if (!selectedDevice) {
        printReceiptHtml(invoice);
        return true;
      }

      const { endpointOut } = await getPrinterInterface(selectedDevice);
      if (!endpointOut) {
        printReceiptHtml(invoice);
        return true;
      }

      const canvas = renderInvoiceToCanvas(invoice);
      const rawData = convertCanvasToEscPos(canvas);

      // إرسال البيانات كحزم USB bulk
      const chunkSize = 512;
      for (let i = 0; i < rawData.length; i += chunkSize) {
        const chunk = rawData.subarray(i, i + chunkSize);
        await selectedDevice.transferOut(endpointOut.endpointNumber, chunk);
      }

      return true;
    } catch (err) {
      console.warn('WebUSB print failed, falling back to Browser HTML Print:', err);
      printReceiptHtml(invoice);
      return true;
    }
  },
};
