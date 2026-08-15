import XLSX from 'xlsx';
import { AppError } from '../types/errors.ts';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_SHEETS = 5;
const MAX_CELLS_PER_SHEET = 50000;

const countSheetCells = (worksheet) => {
  if (!worksheet?.['!ref']) return 0;
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  return (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
};

/**
 * قراءة ملف Excel بأمان (حجم، خلايا، صفوف محدودة).
 * @param {Buffer} buffer محتوى الملف
 * @param {Record<string, any>} [options] خيارات القراءة (cellDates, sheetRows...)
 * @returns {any}
 */
export const readSafeWorkbook = (buffer: Buffer, options: Record<string, any> = {}) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError('Invalid Excel upload', 400);
  }

  if (buffer.length > MAX_EXCEL_BYTES) {
    throw new AppError('Excel file is too large', 400);
  }

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: Boolean(options.cellDates),
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    sheetRows: options.sheetRows || 5000,
    WTF: false,
  });

  if (!workbook.SheetNames.length) {
    throw new AppError('Excel file has no sheets', 400);
  }

  if (workbook.SheetNames.length > MAX_SHEETS) {
    throw new AppError('Excel file has too many sheets', 400);
  }

  for (const sheetName of workbook.SheetNames) {
    if (countSheetCells(workbook.Sheets[sheetName]) > MAX_CELLS_PER_SHEET) {
      throw new AppError('Excel sheet is too large', 400);
    }
  }

  return workbook;
};
