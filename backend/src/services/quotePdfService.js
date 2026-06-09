import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { query } from '../database/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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
  }).format(toNumber(value, 0))} EGP`;

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

const buildQuoteHtml = ({ company, quoteNumber, issuedAt, validUntil, notes, items, logoDataUri, overflowCount }) => {
  const rows = items
    .map(
      (item) => `
        <tr>
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
      color: #24170f;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
      overflow: hidden;
    }
    .page {
      width: 210mm;
      height: 297mm;
      padding: 10mm 12mm 9mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .topbar {
      height: 6px;
      background: #5c3d2e;
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 14px;
      padding: 8mm 0 5mm;
      flex: 0 0 auto;
    }
    .logo {
      width: 54mm;
      height: 28mm;
      object-fit: contain;
      object-position: center right;
      flex: 0 0 auto;
    }
    .store-name {
      font-size: 22pt;
      font-weight: 800;
      line-height: 1.1;
      color: #2a1b12;
      text-align: right;
      flex: 1;
    }
    .title {
      text-align: center;
      font-size: 18pt;
      font-weight: 800;
      color: #5c3d2e;
      margin: 0 0 5mm;
      letter-spacing: 0;
      flex: 0 0 auto;
    }
    .table-wrap {
      flex: 1 1 auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
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
      font-size: 11pt;
      font-weight: 800;
      padding: 9px 12px;
      line-height: 1.1;
    }
    tbody td {
      font-size: 10.3pt;
      padding: 7px 12px;
      border-bottom: 1px solid #e7d9c7;
      vertical-align: middle;
      line-height: 1.25;
    }
    tbody tr:nth-child(even) { background: #faf6f1; }
    tbody tr:nth-child(odd) { background: #fff; }
    .item { width: 58%; text-align: right; }
    .unit { width: 17%; text-align: center; }
    .price { width: 25%; text-align: left; white-space: nowrap; }
    .note {
      margin-top: 3mm;
      text-align: center;
      font-size: 8.8pt;
      color: #7a5f4a;
      flex: 0 0 auto;
    }
    .footer {
      margin-top: 5mm;
      background: #fbf7f0;
      border: 1px solid #e6d8c8;
      border-radius: 14px;
      padding: 10px 14px 11px;
      flex: 0 0 auto;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 18px;
      align-items: start;
    }
    .footer-item {
      display: flex;
      gap: 10px;
      align-items: baseline;
      justify-content: flex-start;
    }
    .footer-label {
      color: #7c6654;
      font-size: 9.4pt;
      font-weight: 800;
      white-space: nowrap;
      flex: 0 0 auto;
      min-width: 62px;
      text-align: right;
    }
    .footer-value {
      flex: 1 1 auto;
      font-size: 10pt;
      color: #24170f;
      text-align: right;
      line-height: 1.35;
      word-break: break-word;
    }
    .footer-span-2 { grid-column: 1 / -1; }
    .muted { color: #7a5f4a; }
  </style>
</head>
<body>
  <div class="page">
    <div class="topbar"></div>
    <header class="header">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="${escapeHtml(company.name_ar || 'بن العجوز')}" />` : ''}
      <div class="store-name">${escapeHtml(company.name_ar || 'بن العجوز')}</div>
    </header>

    <h1 class="title">عرض أسعار</h1>

    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="item">الصنف</th>
            <th class="unit">الوحدة</th>
            <th class="price">السعر</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td class="item muted" colspan="3">لا توجد بنود مضافة.</td></tr>`}
        </tbody>
      </table>
      ${overflowNote}
    </section>

    <footer class="footer">
      <div class="footer-grid">
        <div class="footer-item footer-span-2">
          <div class="footer-label">العنوان</div>
          <div class="footer-value">${escapeHtml(company.address || 'العنوان غير متاح')}</div>
        </div>
        <div class="footer-item">
          <div class="footer-label">التليفون</div>
          <div class="footer-value">${escapeHtml(company.phone || '01000000000')}</div>
        </div>
        <div class="footer-item">
          <div class="footer-label">تاريخ العرض</div>
          <div class="footer-value">${escapeHtml(formatDate(issuedAt))}</div>
        </div>
        <div class="footer-item footer-span-2">
          <div class="footer-label">الصلاحية</div>
          <div class="footer-value">ساري لمدة 15 يوم حتى ${escapeHtml(formatDate(validUntil))}</div>
        </div>
        <div class="footer-item footer-span-2">
          <div class="footer-label">ملاحظات</div>
          <div class="footer-value">${escapeHtml(notes || 'لا توجد ملاحظات إضافية')}</div>
        </div>
      </div>
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

