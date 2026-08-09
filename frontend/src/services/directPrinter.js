// Direct Thermal Printing Service via WebUSB (ESC/POS Canvas-to-Raster)
// Supports all thermal receipt printers (80mm / 58mm) with full Arabic text layout.

let selectedDevice = null;

const PRINTER_WIDTH = 576; // 80mm paper width in dots (72mm printable area at 203 DPI)

// Claim USB Interface
const getPrinterInterface = async (device) => {
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
        const ep = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
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
    endpointOut = alt.endpoints.find((e) => e.direction === 'out');
  }

  await device.claimInterface(interfaceNumber);
  return { interfaceNumber, endpointOut };
};

// Render invoice details onto an HTML Canvas
const renderInvoiceToCanvas = (invoice) => {
  const canvas = document.createElement('canvas');
  canvas.width = PRINTER_WIDTH;

  const ctx = canvas.getContext('2d');
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

  items.forEach((item) => {
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
const convertCanvasToEscPos = (canvas) => {
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

  // Paper Feed ESC d 4 (0x1B, 0x64, 0x04)
  bytes.push(0x1b, 0x64, 0x06);

  // Paper Cut GS V 65 0 (0x1D, 0x56, 0x41, 0x00)
  bytes.push(0x1d, 0x56, 0x41, 0x00);

  return new Uint8Array(bytes);
};

export const directPrinter = {
  isSupported: () => {
    return !!navigator.usb;
  },

  selectPrinter: async () => {
    try {
      selectedDevice = await navigator.usb.requestDevice({ filters: [] });
      localStorage.setItem(
        'selected_usb_printer_name',
        selectedDevice.productName || 'USB Printer',
      );
      return selectedDevice;
    } catch (err) {
      console.error('Failed to select USB device:', err);
      throw err;
    }
  },

  getSelectedPrinterName: () => {
    return localStorage.getItem('selected_usb_printer_name');
  },

  print: async (invoice) => {
    if (!navigator.usb) {
      throw new Error(
        'ميزة الطباعة المباشرة غير مدعومة في هذا المتصفح. يرجى استخدام Chrome أو Edge.',
      );
    }

    // Auto-reconnect if device selected before
    if (!selectedDevice) {
      const devices = await navigator.usb.getDevices();
      if (devices.length > 0) {
        selectedDevice = devices[0];
      }
    }

    if (!selectedDevice) {
      throw new Error('يرجى تحديد طابعة الـ USB أولاً بالضغط على زر "تحديد طابعة".');
    }

    const { endpointOut } = await getPrinterInterface(selectedDevice);
    if (!endpointOut) {
      throw new Error('فشل العثور على منفذ إخراج البيانات (Bulk Out) في الطابعة المحددة.');
    }

    const canvas = renderInvoiceToCanvas(invoice);
    const rawData = convertCanvasToEscPos(canvas);

    // Send in chunks of 512 bytes (standard USB bulk transfer size)
    const chunkSize = 512;
    for (let i = 0; i < rawData.length; i += chunkSize) {
      const chunk = rawData.subarray(i, i + chunkSize);
      await selectedDevice.transferOut(endpointOut.endpointNumber, chunk);
    }

    return true;
  },
};
