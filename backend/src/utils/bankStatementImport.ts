import { AppError } from '../types/errors.ts';
import { isCalendarDate } from './localDate.ts';
import { roundMoney } from './money.ts';

const digits = (text: string) =>
  text.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)),
  );
const invalid = (row: number, field: string) =>
  new AppError(
    `كشف الحساب: قيمة ${field} غير صالحة في السطر ${row}. التاريخ YYYY-MM-DD أو DD/MM/YYYY والمبلغ رقم واضح دون تغيير اتجاهه`,
    400,
  );
const empty = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === '';

export function bankImportDate(value: unknown, row: number, date1904 = false): string {
  let result = '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const day = Math.floor(value);
    if (day < (date1904 ? 0 : 1) || (!date1904 && day === 60) || day > 2958465)
      throw invalid(row, 'التاريخ');
    const base = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31);
    result = new Date(base + (day - (!date1904 && day > 60 ? 1 : 0)) * 86400000)
      .toISOString()
      .slice(0, 10);
  } else if (typeof value === 'string') {
    const text = digits(value.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) result = text;
    else {
      const match = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(text);
      if (match) result = `${match[4]}-${match[3].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
  }
  if (!isCalendarDate(result) || result.startsWith('0000')) throw invalid(row, 'التاريخ');
  return result;
}

export function bankImportMoney(value: unknown, row: number, field: string): number {
  if (empty(value)) return 0;
  let amount: number;
  if (typeof value === 'number') amount = value;
  else if (typeof value === 'string') {
    let text = digits(value.trim()).replace(/٫/g, '.').replace(/٬/g, ',');
    text = text
      .replace(/^(?:EGP|L\.?E\.?|ج\.م\.?|جنيه)\s*/i, '')
      .replace(/\s*(?:EGP|L\.?E\.?|ج\.م\.?|جنيه)$/i, '')
      .trim();
    let negative = false;
    if (/^\(.*\)$/.test(text)) {
      negative = true;
      text = text.slice(1, -1).trim();
    }
    if (text.startsWith('-')) {
      if (negative) throw invalid(row, field);
      negative = true;
      text = text.slice(1);
    }
    if (text.startsWith('+')) {
      if (negative) throw invalid(row, field);
      text = text.slice(1);
    }
    if (/\s/.test(text)) {
      if (!/^[1-9]\d{0,2}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?$/.test(text)) throw invalid(row, field);
      text = text.replace(/[\s\u00a0]/g, '');
    }
    if (text.includes(',') && text.includes('.')) {
      if (/^[1-9]\d{0,2}(?:,\d{3})+\.\d+$/.test(text)) text = text.replaceAll(',', '');
      else if (/^[1-9]\d{0,2}(?:\.\d{3})+,\d+$/.test(text))
        text = text.replaceAll('.', '').replace(',', '.');
      else throw invalid(row, field);
    } else if (text.includes(',')) {
      if (/^[1-9]\d{0,2}(?:,\d{3})+$/.test(text)) text = text.replaceAll(',', '');
      else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
      else throw invalid(row, field);
    }
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw invalid(row, field);
    amount = Number(text) * (negative ? -1 : 1);
  } else throw invalid(row, field);
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e13) throw invalid(row, field);
  const rounded = roundMoney(amount);
  if (Math.abs(rounded) >= 1e13) throw invalid(row, field);
  return rounded;
}

const aliases = {
  date: [
    'date',
    'transdate',
    'transactiondate',
    'valuedate',
    'تاريخ',
    'التاريخ',
    'تاريخالحركة',
    'تاريخالعملية',
  ],
  description: [
    'description',
    'desc',
    'details',
    'particular',
    'particulars',
    'وصف',
    'بيان',
    'تفاصيل',
  ],
  reference: [
    'reference',
    'ref',
    'cheque',
    'check',
    'chequenumber',
    'مرجع',
    'شيك',
    'رقم',
    'رقمالمرجع',
  ],
  debit: ['debit', 'debitamount', 'withdrawal', 'withdrawals', 'out', 'مدين', 'سحب', 'منه'],
  credit: ['credit', 'creditamount', 'deposit', 'deposits', 'in', 'دائن', 'إيداع', 'ايداع', 'له'],
  amount: ['amount', 'net', 'netamount', 'transactionamount', 'مبلغ', 'قيمة', 'المبلغ'],
} as const;
type Field = keyof typeof aliases;
export interface ImportedBankMovement {
  transaction_date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  amount: number;
}
export function parseBankStatementRows(
  rows: unknown[][],
  cutoff: string,
  date1904 = false,
  filename = '',
): ImportedBankMovement[] {
  if (!rows.length) throw new AppError('لم يتم العثور على حركات في كشف الحساب', 400);
  const columns: Partial<Record<Field, number>> = {};
  rows[0].forEach((header, index) => {
    const name = String(header ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_.-]/g, '')
      .replace(/^ال/, '');
    for (const field of Object.keys(aliases) as Field[]) {
      if (!(aliases[field] as readonly string[]).includes(name)) continue;
      if (columns[field] !== undefined)
        throw new AppError(`كشف الحساب يحتوي أكثر من عمود لـ ${field}؛ حدد عموداً واحداً`, 400);
      columns[field] = index;
    }
  });
  if (
    columns.date === undefined ||
    (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined)
  )
    throw new AppError('كشف الحساب يحتاج عمود التاريخ وعمود المبلغ أو مدين/دائن', 400);
  const result: ImportedBankMovement[] = [];
  rows.slice(1).forEach((values, index) => {
    if (values.every(empty)) return;
    const line = index + 2;
    const get = (field: Field) =>
      columns[field] === undefined ? undefined : values[columns[field]!];
    const date = bankImportDate(get('date'), line, date1904);
    if (date > cutoff)
      throw new AppError(`تاريخ الحركة في السطر ${line} بعد تاريخ كشف التسوية`, 400);
    let debit = bankImportMoney(get('debit'), line, 'المدين');
    let credit = bankImportMoney(get('credit'), line, 'الدائن');
    const hasAmount = !empty(get('amount'));
    const amount = bankImportMoney(get('amount'), line, 'المبلغ');
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) throw invalid(line, 'اتجاه الحركة');
    if (debit || credit) {
      if (hasAmount && amount !== roundMoney(credit - debit)) throw invalid(line, 'المبلغ الصافي');
    } else if (amount < 0) debit = -amount;
    else credit = amount;
    if (!debit && !credit) return;
    if (typeof get('reference') === 'number' && !Number.isSafeInteger(get('reference')))
      throw invalid(line, 'المرجع؛ احفظ أرقام المرجع الطويلة كنص');
    result.push({
      transaction_date: date,
      description: String(get('description') || filename || 'حركة كشف حساب').trim(),
      reference: String(get('reference') ?? '').trim(),
      debit,
      credit,
      amount: roundMoney(credit - debit),
    });
  });
  if (!result.length) throw new AppError('تعذر استخراج حركات مالية من كشف الحساب', 400);
  return result;
}
