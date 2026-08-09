import XLSX from 'xlsx';
import { deleteAllSales, importDailySales } from './salesService.js';
import { readSafeWorkbook } from './excelSecurity.js';
import { parseLocalizedNumber } from '../utils/numberParsing.js';

const TEMPLATE_HEADERS = [
  'sale_date',
  'sale_type',
  'total_amount',
  'customer_code',
  'payment_status',
  'payment_method',
  'profit_amount',
  'notes',
  'action',
];

const HEADER_ALIASES = {
  sale_date: ['sale_date', 'date', '???????', '?????'],
  sale_type: ['sale_type', 'type', '?????', '??? ?????'],
  total_amount: ['total_amount', 'amount', '??????', '????????'],
  customer_code: ['customer_code', 'customer', 'customer name', '??????', '??? ??????'],
  payment_status: ['payment_status', 'status', '???? ?????'],
  payment_method: ['payment_method', 'method', '????? ?????'],
  profit_amount: ['profit_amount', 'profit', '?????'],
  notes: ['notes', 'note', '???????'],
  action: ['action', '?????', '???????'],
};

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');

const normalizeDigits = (value) =>
  String(value ?? '')
    .replace(/[?-?]/g, (d) => '0123456789'['??????????'.indexOf(d)])
    .replace(/[\u200f\u200e]/g, '')
    .trim();

const toNumber = (value, fallback = 0) => {
  return parseLocalizedNumber(value, fallback);
};

const formatYmd = (year, month, day) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isValidDateParts = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
};

const parseDate = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number') {
    const dc = XLSX.SSF.parse_date_code(value);
    if (!dc) return null;
    return isValidDateParts(dc.y, dc.m, dc.d) ? formatYmd(dc.y, dc.m, dc.d) : null;
  }

  const text = normalizeDigits(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isValidDateParts(y, m, d) ? formatYmd(y, m, d) : null;
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const d = Number(compact[3]);
    return isValidDateParts(y, m, d) ? formatYmd(y, m, d) : null;
  }

  const delimited = text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (delimited) {
    if (delimited[1].length === 4) {
      const y = Number(delimited[1]);
      const m = Number(delimited[2]);
      const d = Number(delimited[3]);
      return isValidDateParts(y, m, d) ? formatYmd(y, m, d) : null;
    }
    if (delimited[3].length === 4) {
      const a = Number(delimited[1]);
      const b = Number(delimited[2]);
      const y = Number(delimited[3]);
      const dayFirst = isValidDateParts(y, b, a);
      const monthFirst = isValidDateParts(y, a, b);
      if (dayFirst && !monthFirst) return formatYmd(y, b, a);
      if (!dayFirst && monthFirst) return formatYmd(y, a, b);
      if (dayFirst && monthFirst) return formatYmd(y, b, a);
    }
  }

  return null;
};

const normalizeSaleType = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  if (['branch', '????', '???', '?????????', '???'].includes(text) || text.startsWith('branch'))
    return 'branch';
  if (['wholesale', '????', '????', 'wholesales'].includes(text) || text.startsWith('wholesale'))
    return 'wholesale';
  return null;
};

const normalizePaymentStatus = (value) => {
  const text = normalizeText(value);
  if (!text || ['paid', '?????', '????'].includes(text)) return 'paid';
  if (['unpaid', '????????', '?????'].includes(text)) return 'unpaid';
  if (['partial', '????', '??????????'].includes(text)) return 'partial';
  return 'paid';
};

const normalizePaymentMethod = (value) => {
  const text = normalizeText(value);
  if (!text || ['cash', '????', '???'].includes(text)) return 'cash';
  if (['card', '?????', '????'].includes(text)) return 'card';
  if (['transfer', '?????'].includes(text)) return 'transfer';
  if (['credit', '???', '???'].includes(text)) return 'credit';
  return 'cash';
};

const headersFromRow = (row) => row.map((h) => normalizeText(h));
const findIndex = (headers, aliases) =>
  headers.findIndex((header) =>
    aliases.some(
      (alias) => header === normalizeText(alias) || header.includes(normalizeText(alias)),
    ),
  );

const resolveHeaderIndices = (headers) => ({
  sale_date: findIndex(headers, HEADER_ALIASES.sale_date),
  sale_type: findIndex(headers, HEADER_ALIASES.sale_type),
  total_amount: findIndex(headers, HEADER_ALIASES.total_amount),
  customer_code: findIndex(headers, HEADER_ALIASES.customer_code),
  payment_status: findIndex(headers, HEADER_ALIASES.payment_status),
  payment_method: findIndex(headers, HEADER_ALIASES.payment_method),
  profit_amount: findIndex(headers, HEADER_ALIASES.profit_amount),
  notes: findIndex(headers, HEADER_ALIASES.notes),
  action: findIndex(headers, HEADER_ALIASES.action),
});

export const buildImportTemplate = () => {
  const wb = XLSX.utils.book_new();

  const dataSheet = [
    TEMPLATE_HEADERS,
    ['2026-05-21', 'branch', 1500, 'C-001', 'paid', 'cash', 200, '?????? ?????', ''],
    ['2026-05-21', 'wholesale', 8500, 'C-002', 'partial', 'transfer', 1200, '?????? ????', ''],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataSheet);
  wsData['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsData, 'sales');

  const wsHelp = XLSX.utils.aoa_to_sheet([
    ['???????'],
    ['???? ?????? ????????? ?? ???? ????? ?? ????.'],
    ['??????? delete_all ????? ??????? ?????? ?? ?????? ??? ???????.'],
    ['??????? ??????? ???: branch ?? wholesale.'],
    ['????? ?????: paid ?? unpaid ?? partial.'],
    ['??? ?????: cash ?? card ?? transfer ?? credit.'],
  ]);
  wsHelp['!cols'] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsHelp, 'instructions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const parseRow = (row, indices) => {
  const action = normalizeText(indices.action >= 0 ? row[indices.action] : '');
  if (action === 'delete_all') return { action: 'delete_all' };

  const saleType = normalizeSaleType(indices.sale_type >= 0 ? row[indices.sale_type] : null);
  if (!saleType) throw new Error('??? ????? ??? ????');

  const saleDate = parseDate(indices.sale_date >= 0 ? row[indices.sale_date] : null);
  if (!saleDate) throw new Error('????? ????? ??? ????');

  const totalAmount = toNumber(indices.total_amount >= 0 ? row[indices.total_amount] : null, 0);
  if (totalAmount <= 0) throw new Error('?????? ?????? ??? ?? ???? ???? ?? ???');

  return {
    sale_date: saleDate,
    sale_type: saleType,
    total_amount: totalAmount,
    customer_code:
      indices.customer_code >= 0
        ? String(row[indices.customer_code] || '').trim() || undefined
        : undefined,
    payment_status: normalizePaymentStatus(
      indices.payment_status >= 0 ? row[indices.payment_status] : null,
    ),
    payment_method: normalizePaymentMethod(
      indices.payment_method >= 0 ? row[indices.payment_method] : null,
    ),
    profit_amount: toNumber(indices.profit_amount >= 0 ? row[indices.profit_amount] : null, 0),
    notes: indices.notes >= 0 ? String(row[indices.notes] || '').trim() || undefined : undefined,
  };
};

export const parseSalesExcel = (buffer) => {
  const wb = readSafeWorkbook(buffer, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('??? ???????? ????');

  const headers = headersFromRow(rows[0]);
  const indices = resolveHeaderIndices(headers);
  if (indices.sale_date === -1 || indices.sale_type === -1 || indices.total_amount === -1) {
    throw new Error('??? ???????? ?? ????? ??? ??????? ????????');
  }

  const parsed = [];
  const errors = [];
  let hasDeleteAll = false;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every((cell) => cell === '' || cell == null)) continue;
    try {
      const parsedRow = parseRow(row, indices);
      if (parsedRow.action === 'delete_all') {
        hasDeleteAll = true;
        continue;
      }
      parsed.push(parsedRow);
    } catch (e) {
      errors.push({ row: i + 1, message: e.message });
    }
  }

  if (!parsed.length && !hasDeleteAll && errors.length) {
    throw new Error(errors.map((e) => `???? ${e.row}: ${e.message}`).join(' | '));
  }

  return { rows: parsed, errors, hasDeleteAll };
};

export const validateSalesExcel = (buffer) => {
  const { rows, errors, hasDeleteAll } = parseSalesExcel(buffer);
  return {
    ok: rows.length > 0 || hasDeleteAll,
    validCount: rows.length,
    hasDeleteAll,
    parseErrors: errors,
    preview: rows.slice(0, 5),
  };
};

export const importFromExcel = async (buffer, userId, options = {}) => {
  const { rows, errors, hasDeleteAll } = parseSalesExcel(buffer);
  if (hasDeleteAll && options.confirm !== 'CONFIRM_DELETE_ALL_SALES') {
    throw new Error('delete_all requires explicit confirmation');
  }
  let deletedCount = 0;
  if (hasDeleteAll) {
    const purge = await deleteAllSales(userId);
    deletedCount = purge.deletedCount || 0;
  }
  const importResult = await importDailySales(rows, userId);
  return { ...importResult, parseErrors: errors, hasDeleteAll, deletedCount };
};
