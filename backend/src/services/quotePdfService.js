import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { query } from '../database/pool.js';
import { toNumber } from '../utils/money.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);



const toDate = (value) => {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(toDate(value));

const formatMoney = (value) =>
  `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value, 0))} ج.م`;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const generateQuoteNumber = (issuedAt = new Date()) => {
  const d = toDate(issuedAt);
  const stamp = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('');
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `QUO-${stamp}-${suffix}`;
};

const getCompanyInfo = async () => {
  const settings = await query(`SELECT key, value FROM settings WHERE key IN ('company')`);
  return {
    company: settings.rows.find((r) => r.key === 'company')?.value || {},
  };
};

const resolveLogoDataUri = async () => {
  const candidates = [
    path.resolve(process.cwd(), 'assets/logo.png'),
    path.resolve(process.cwd(), '../assets/logo.png'),
    path.resolve(__dirname, '../../../assets/logo.png'),
  ];
  const logoPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!logoPath) return null;
  const ext = path.extname(logoPath).slice(1).toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const data = await fs.readFile(logoPath);
  return `data:${mime};base64,${data.toString('base64')}`;
};

const resolveChromePath = () => {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const normalizeItems = (items = []) =>
  items
    .map((item, idx) => ({
      no: idx + 1,
      product_name: String(item.product_name || item.description || item.name || `بند ${idx + 1}`).trim(),
      unit: String(item.unit || '').trim(),
      unit_price: Math.max(0, toNumber(item.unit_price ?? item.price, 0)),
    }))
    .filter((item) => item.product_name);

const buildQuoteHtml = ({ company, quoteNumber, customerName, issuedAt, validUntil, notes, items, logoDataUri, overflowCount }) => {
  const rows = items
    .map(
      (item, idx) => `
        <tr>
          <td class="no">${idx + 1}</td>
          <td class="item">${escapeHtml(item.product_name)}</td>
          <td class="unit">${escapeHtml(item.unit || 'وحدة')}</td>
          <td class="price">${escapeHtml(formatMoney(item.unit_price))}</td>
        </tr>`,
    )
    .join('');

  const overflowNote = overflowCount
    ? `<div class="note">تم اختصار ${escapeHtml(overflowCount)} بندًا إضافيًا للحفاظ على الصفحة الواحدة.</div>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>عرض أسعار - ${escapeHtml(quoteNumber)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; }
    body {
      direction: rtl;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      color: #1a1510;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
      overflow: hidden;
    }
    .page {
      width: 210mm;
      height: 297mm;
      padding: 15mm 15mm 12mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .watermark {
      position: absolute;
      top: 55%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90mm;
      height: 90mm;
      opacity: 0.04;
      pointer-events: none;
      z-index: 0;
      object-fit: contain;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 6mm;
      border-bottom: 3px solid #5c3d2e;
      margin-bottom: 6mm;
      flex: 0 0 auto;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo {
      width: 20mm;
      height: 20mm;
      object-fit: contain;
      border-radius: 8px;
    }
    .company-details h1 {
      font-size: 18pt;
      color: #5c3d2e;
      margin: 0 0 4px;
      font-weight: 800;
    }
    .company-details .tagline {
      color: #8b5e3c;
      font-size: 9pt;
      margin: 0 0 6px;
      font-weight: 700;
    }
    .company-details p {
      margin: 2px 0;
      font-size: 8.5pt;
      color: #555;
    }
    .title-box {
      text-align: left;
      background: linear-gradient(135deg, #5c3d2e, #8b5e3c);
      color: #fff;
      padding: 12px 20px;
      border-radius: 10px;
      min-width: 150px;
    }
    .title-box .doc-type {
      display: block;
      font-size: 8.5pt;
      opacity: 0.9;
    }
    .title-box .doc-number {
      display: block;
      font-size: 12pt;
      font-weight: 800;
      margin-top: 4px;
    }
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 6mm;
      flex: 0 0 auto;
    }
    .party-box {
      background: #f8f6f3;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #e8e0d5;
    }
    .party-box h4 {
      margin: 0 0 8px;
      color: #5c3d2e;
      font-size: 9.5pt;
      font-weight: 800;
    }
    .party-box p {
      margin: 4px 0;
      font-size: 9pt;
    }
    .table-wrap {
      flex: 1 1 auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
      margin-bottom: 4mm;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      direction: rtl;
    }
    thead th {
      background: #5c3d2e;
      color: #fff;
      font-size: 10pt;
      font-weight: 800;
      padding: 10px 12px;
      text-align: right;
    }
    tbody td {
      font-size: 9.5pt;
      padding: 8px 12px;
      border-bottom: 1px solid #e8e0d5;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) { background: #fbf9f6; }
    .no { width: 8%; text-align: right; }
    .item { width: 50%; text-align: right; }
    .unit { width: 17%; text-align: right; }
    .price { width: 25%; text-align: left; }
    .notes-box {
      background: #fff9e6;
      padding: 10px 14px;
      border-radius: 6px;
      border-right: 4px solid #c9a227;
      font-size: 9pt;
      margin-bottom: 4mm;
      flex: 0 0 auto;
      color: #7c5f00;
    }
    .footer {
      text-align: center;
      padding-top: 4mm;
      border-top: 1px solid #e8e0d5;
      color: #666;
      font-size: 8.5pt;
      flex: 0 0 auto;
    }
    .footer p { margin: 2px 0; }
  </style>
</head>
<body>
  <div class="page">
    ${logoDataUri ? `<img class="watermark" src="${logoDataUri}" alt="" />` : ''}
    <header class="header">
      <div class="brand">
        ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="${escapeHtml(company.name_ar || 'بن العجوز')}" />` : ''}
        <div class="company-details">
          <h1>${escapeHtml(company.name_ar || 'بن العجوز')}</h1>
          <p class="tagline">${escapeHtml(company.tagline || 'للحب التركي')}</p>
          <p><strong>العنوان:</strong> ${escapeHtml(company.address || 'جمهورية مصر العربية')}</p>
          <p><strong>الهاتف:</strong> ${escapeHtml(company.phone || '01000000000')}</p>
        </div>
      </div>
      <div class="title-box">
        <span class="doc-type">عرض سعر</span>
        <span class="doc-number">${escapeHtml(quoteNumber)}</span>
      </div>
    </header>

    <div class="parties">
      <div class="party-box">
        <h4>بيانات العميل</h4>
        <p><strong>الاسم:</strong> ${escapeHtml(customerName)}</p>
      </div>
      <div class="party-box">
        <h4>تفاصيل العرض</h4>
        <p><strong>تاريخ العرض:</strong> ${escapeHtml(formatDate(issuedAt))}</p>
        <p><strong>صلاحية العرض:</strong> ساري حتى ${escapeHtml(formatDate(validUntil))}</p>
      </div>
    </div>

    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="no">#</th>
            <th class="item">البيان</th>
            <th class="unit">الوحدة</th>
            <th class="price">السعر</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td class="item muted" colspan="4">لا توجد بنود مضافة.</td></tr>`}
        </tbody>
      </table>
      ${overflowNote}
    </section>

    ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${escapeHtml(notes)}</div>` : ''}

    <footer class="footer">
      <p>نتشرف بخدمتكم دائمًا، ونشكركم على ثقتكم في ${escapeHtml(company.name_ar || 'بن العجوز')}.</p>
    </footer>
  </div>
</body>
</html>`;
};

const renderHtmlToPdf = async (html) => {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error('Chrome not found for PDF rendering');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quote-pdf-'));
  const htmlPath = path.join(tempDir, 'quote.html');
  const pdfPath = path.join(tempDir, 'quote.pdf');
  await fs.writeFile(htmlPath, html, 'utf8');

  try {
    await execFileAsync(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        '--hide-scrollbars',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=1200',
        '--print-to-pdf-no-header',
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { timeout: 60000, windowsHide: true },
    );

    const buffer = await fs.readFile(pdfPath);
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

export const generateQuotePdf = async (payload = {}) => {
  const { company } = await getCompanyInfo();
  const quoteNumber = String(payload.quote_number || generateQuoteNumber(payload.issued_at)).trim();
  const issuedAt = toDate(payload.issued_at || new Date());
  const validUntil = payload.valid_until ? toDate(payload.valid_until) : addDays(issuedAt, 15);
  const notes = String(payload.notes || '').trim();
  const normalizedItems = normalizeItems(payload.items || []);
  const visibleItems = normalizedItems.slice(0, 20);
  const overflowCount = Math.max(0, normalizedItems.length - visibleItems.length);
  const logoDataUri = await resolveLogoDataUri();

  const html = buildQuoteHtml({
    company,
    quoteNumber,
    customerName: String(payload.customer_name || 'عميل نقدي').trim(),
    issuedAt,
    validUntil,
    notes,
    items: visibleItems,
    logoDataUri,
    overflowCount,
  });

  const buffer = await renderHtmlToPdf(html);
  return { buffer, quoteNumber };
};

