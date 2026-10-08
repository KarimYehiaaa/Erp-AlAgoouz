import XLSX from 'xlsx';
import { expect, it } from 'vitest';
import {
  bankImportDate,
  bankImportMoney,
  parseBankStatementRows,
} from '../src/utils/bankStatementImport.ts';
import { readSafeWorkbook } from '../src/services/excelSecurity.ts';
import { AppError } from '../src/types/errors.ts';

it.each([
  ['1,234.56', 1234.56],
  ['1.234,56', 1234.56],
  ['1 234,56', 1234.56],
  ['١٬٢٣٤٫٥٦', 1234.56],
  ['۱۲۳۴٫۵۶', 1234.56],
  ['12,50', 12.5],
  ['1,234', 1234],
  ['(100.25)', -100.25],
  ['-50', -50],
  ['100 EGP', 100],
  ['ج.م 100', 100],
  [0, 0],
  [50.125, 50.13],
  ['', 0],
])('parses the exact currency value of %s', (input, expected) =>
  expect(bankImportMoney(input, 2, 'المبلغ')).toBe(expected),
);
it.each([
  'abc100',
  '1e3',
  '1,2,3',
  '1.2.3',
  '1 2',
  '0,125',
  '--20',
  '-+20',
  '(-20)',
  NaN,
  Infinity,
  1e13,
  '9999999999999.999',
])('rejects invalid or out-of-range currency %s', (value) =>
  expect(() => bankImportMoney(value, 3, 'المبلغ')).toThrow(),
);
it.each([
  ['2024-02-29', '2024-02-29'],
  ['29/02/2024', '2024-02-29'],
  ['02/03/2024', '2024-03-02'],
  ['٢٩/٠٢/٢٠٢٤', '2024-02-29'],
  [1, '1900-01-01'],
  [59, '1900-02-28'],
  [61.75, '1900-03-01'],
])('preserves the calendar date %s', (value, expected) =>
  expect(bankImportDate(value, 2)).toBe(expected),
);
it.each([
  '',
  '2024-02-30',
  '29/02/2023',
  '0000-01-01',
  '2024-02-29T23:00:00-03:00',
  60,
  -1,
  Infinity,
])('rejects invalid or ambiguous date %s', (value) =>
  expect(() => bankImportDate(value, 2)).toThrow(),
);
it('supports the workbook 1904 epoch without shifting the calendar day', () =>
  expect(bankImportDate(0, 2, true)).toBe('1904-01-01'));
it('uses the actual Excel workbook epoch for numeric date cells', () => {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Date', 'Amount'],
      [0, 12.5],
    ]),
    'bank',
  );
  const read = readSafeWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    raw: true,
  });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[read.SheetNames[0]], {
    header: 1,
    raw: true,
  });
  expect(
    parseBankStatementRows(rows, '1904-01-31', Boolean(read.Workbook?.WBProps?.date1904))[0],
  ).toMatchObject({ transaction_date: '1904-01-01', amount: 12.5 });
});
it('supports Arabic definite headers and preserves a zero reference', () => {
  expect(
    parseBankStatementRows(
      [
        ['التاريخ', 'الدائن', 'المرجع'],
        ['2024-03-01', '١٢٫٥٠', 0],
      ],
      '2024-03-31',
    )[0],
  ).toMatchObject({ amount: 12.5, reference: '0' });
});
it('rejects numeric references that Excel cannot represent exactly', () => {
  expect(() =>
    parseBankStatementRows(
      [
        ['Date', 'Amount', 'Reference'],
        ['2024-03-01', 20, Number.MAX_SAFE_INTEGER + 1],
      ],
      '2024-03-31',
    ),
  ).toThrow();
});
it('ignores unrelated header substrings and derives a signed movement', () => {
  expect(
    parseBankStatementRows(
      [
        ['Date', 'Opening balance', 'Amount', 'Ref'],
        ['2024-02-29', 900, '-12,50', '000012'],
      ],
      '2024-03-31',
    )[0],
  ).toMatchObject({ debit: 12.5, credit: 0, amount: -12.5, reference: '000012' });
});
it.each(
  [
    [
      ['Date', 'Credit'],
      ['bad', 100],
    ],
    [
      ['Date', 'Credit'],
      ['2024-04-01', 100],
    ],
    [
      ['Date', 'Debit', 'Credit'],
      ['2024-03-01', 20, 30],
    ],
    [
      ['Date', 'Debit'],
      ['2024-03-01', -20],
    ],
    [
      ['Date', 'Credit', 'Amount'],
      ['2024-03-01', 20, 30],
    ],
    [
      ['Date', 'Transaction Date', 'Amount'],
      ['2024-03-01', '2024-03-01', 20],
    ],
    [
      ['Description', 'Amount'],
      ['2024-03-01', 20],
    ],
  ].map((rows) => ({ rows })),
)('rejects inconsistent statement rows %#', ({ rows }) =>
  expect(() => parseBankStatementRows(rows, '2024-03-31')).toThrowError(AppError),
);
it('preserves UTF8 CSV dates, decimal commas and leading-zero references before parsing', () => {
  const workbook = readSafeWorkbook(
    Buffer.from('Date,Credit,Reference\n02/03/2024,"12,50",000012'),
    { raw: true, codepage: 65001 },
  );
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    raw: true,
  });
  expect(parseBankStatementRows(rows, '2024-03-31')[0]).toMatchObject({
    transaction_date: '2024-03-02',
    amount: 12.5,
    reference: '000012',
  });
});
it('reads Arabic UTF8 CSV headers and amounts without a BOM', () => {
  const workbook = readSafeWorkbook(Buffer.from('التاريخ,دائن,مرجع\n٢٩/٠٢/٢٠٢٤,١٢٫٥٠,000012'), {
    raw: true,
    codepage: 65001,
  });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    raw: true,
  });
  expect(parseBankStatementRows(rows, '2024-03-31')[0]).toMatchObject({
    transaction_date: '2024-02-29',
    amount: 12.5,
    reference: '000012',
  });
});
it('rejects truncated workbooks instead of silently returning a partial sheet', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(Array.from({ length: 5001 }, (_, i) => [i])),
    'rows',
  );
  expect(() =>
    readSafeWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })),
  ).toThrow('row limit');
});
