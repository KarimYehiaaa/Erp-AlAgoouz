import PDFDocument from 'pdfkit';
import { getInvoiceById } from './invoiceService.ts';

const fmt = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP`;

/**
 * توليد ملف PDF لفواتير الخدمات (A4 أو حراري).
 * @param {number} invoiceId معرف الفاتورة
 * @returns {Promise<Buffer>}
 */
export const generateInvoicePdf = async (invoiceId: number) => {
  const invoice = await getInvoiceById(invoiceId);
  const company = invoice.company || {};
  const invoiceNumber = invoice.invoice_number;

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: any[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const brown = '#5C3D2E';
    const light = '#F5E6D3';

    doc.rect(0, 0, doc.page.width, 90).fill(brown);
    doc
      .fillColor('#fff')
      .fontSize(22)
      .text(company.name_ar || 'Bin Al-Ajouz', 50, 35, { align: 'left' });
    doc.fontSize(10).text('Turkish Coffee', 50, 52);
    doc.text(`Address: ${company.address || 'Egypt'}`, 50, 66);
    doc.text(`Tel: ${company.phone || '01000000000'}`, 50, 80);

    doc.fillColor('#000').fontSize(16).text('INVOICE / FATURA', 50, 115);
    doc.fontSize(10);
    doc.text(`No: ${invoice.invoice_number}`, 50, 140);
    doc.text(`Date: ${new Date(invoice.issued_at).toLocaleDateString('en-GB')}`, 50, 155);
    doc.text(`Customer: ${invoice.customer_name || 'Cash Customer'}`, 50, 170);
    if (invoice.customer_phone) doc.text(`Phone: ${invoice.customer_phone}`, 50, 185);
    doc.text(`Status: ${invoice.payment_status}`, 50, 200);

    let y = 225;
    doc.rect(50, y, 495, 22).fill(light);
    doc.fillColor(brown).fontSize(9);
    doc.text('#', 55, y + 6, { width: 25 });
    doc.text('Description', 85, y + 6, { width: 200 });
    doc.text('Qty', 300, y + 6, { width: 40 });
    doc.text('Price', 350, y + 6, { width: 60 });
    doc.text('Total', 420, y + 6, { width: 80 });
    y += 28;

    doc.fillColor('#000').fontSize(9);
    (invoice.items || []).forEach((item, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const desc = item.description || item.product_name || '-';
      doc.text(String(i + 1), 55, y, { width: 25 });
      doc.text(desc.substring(0, 45), 85, y, { width: 200 });
      doc.text(String(item.quantity), 300, y, { width: 40 });
      doc.text(fmt(item.unit_price), 350, y, { width: 60 });
      doc.text(fmt(item.total_amount), 420, y, { width: 80 });
      y += 20;
    });

    y += 10;
    y += 15;
    doc.text(`Discount: ${fmt(invoice.discount_amount)}`, 350, y);
    y += 15;
    doc.text(`Tax: ${fmt(invoice.tax_amount)}`, 350, y);
    y += 20;
    doc
      .fontSize(12)
      .fillColor(brown)
      .text(`TOTAL: ${fmt(invoice.total_amount)}`, 350, y);

    if (invoice.notes) {
      y += 40;
      doc.fillColor('#666').fontSize(9).text(`Notes: ${invoice.notes}`, 50, y, { width: 480 });
    }

    doc
      .fontSize(8)
      .fillColor('#999')
      .text('Thank you - Bin Al-Ajouz', 50, doc.page.height - 40, { align: 'center', width: 495 });

    doc.end();
  });

  return { buffer, invoiceNumber };
};
