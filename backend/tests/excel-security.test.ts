import { expect, it } from 'vitest';
import { buildImportTemplate, parseSalesExcel } from '../src/services/salesExcelService.ts';
import { readSafeWorkbook } from '../src/services/excelSecurity.ts';

it('reads and parses the generated sales workbook using the secured Excel reader', () => {
  const workbook = readSafeWorkbook(buildImportTemplate(), { cellDates: true });

  expect(workbook.SheetNames).toContain('sales');
  expect(parseSalesExcel(buildImportTemplate())).toMatchObject({
    rows: [
      { sale_type: 'retail', total_amount: 1500, profit_amount: 200 },
      { sale_type: 'wholesale', total_amount: 8500, profit_amount: 1200 },
    ],
    errors: [],
    hasDeleteAll: false,
  });
});

it('rejects non-buffer and oversized Excel input before parsing', () => {
  expect(() => readSafeWorkbook('not a buffer' as unknown as Buffer)).toThrow(
    'Invalid Excel upload',
  );
  expect(() => readSafeWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow(
    'Excel file is too large',
  );
});
