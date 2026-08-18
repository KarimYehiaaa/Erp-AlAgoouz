/**
 * salesCalculations.ts — أدوات الحساب النقيّة لدورة المبيعات
 * ═══════════════════════════════════════════════════════
 * دوال حسابية خالصة (بلا اعتماد على قاعدة البيانات) استُخرجت من
 * salesService.ts لتقليل حجم الملف المركزي:
 *  - حساب مجاميع الفاتورة (إجمالي الأصناف، الخصم، الضريبة)
 *  - حساب المبلغ المدفوع الفعلي حسب حالة الدفع
 *  - حساب المبلغ المتبقي غير المدفوع
 *  - تسميات أنواع البيع
 */
import { AppError } from '../types/errors.ts';
import { roundMoney, parseAmount, sumMoney } from '../utils/money.ts';

/**
 * حساب مجاميع الفاتورة (إجمالي الأصناف، الخصم، الضريبة).
 * @param {any[]} [items] أصناف البيع
 * @param {Record<string, any>} [data] بيانات البيع (discount_amount, total_amount...)
 * @returns {{ items: any[], subtotal: number, itemDiscountTotal: number, discountAmount: number, taxAmount: number, taxPercent: number, totalAmount: number }}
 */
const calculateSaleTotals = (items: any[] = [], data: Record<string, any> = {}) => {
  const normalizedItems: any[] = [];
  let subtotal = 0;
  let itemDiscountTotal = 0;
  let itemsTotal = 0;
  for (const [idx, item] of items.entries()) {
    const productId = Number(item.product_id);
    const quantity = parseAmount(item.quantity);
    const unitPrice = parseAmount(item.unit_price);
    const discountAmount2 = parseAmount(item.discount_amount);
    const taxAmount2 = 0;
    if (!productId) throw new AppError(`Item ${idx + 1}: product is required`);
    if (quantity <= 0) throw new AppError(`Item ${idx + 1}: quantity must be greater than zero`);
    if (unitPrice < 0) throw new AppError(`Item ${idx + 1}: unit price cannot be negative`);
    if (discountAmount2 < 0) throw new AppError(`Item ${idx + 1}: discount cannot be negative`);
    const grossLineTotal = roundMoney(quantity * unitPrice);
    if (discountAmount2 > grossLineTotal) {
      throw new AppError(`Item ${idx + 1}: discount cannot exceed line total`);
    }
    const lineTotal = roundMoney(grossLineTotal - discountAmount2 + taxAmount2);
    // تجميع بقرّوش صحيحة (تحصين الفاصلة العائمة)
    subtotal = sumMoney(subtotal, grossLineTotal);
    itemDiscountTotal = sumMoney(itemDiscountTotal, discountAmount2);
    itemsTotal = sumMoney(itemsTotal, lineTotal);
    normalizedItems.push({
      ...item,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount2,
      tax_amount: taxAmount2,
      total_amount: lineTotal,
    });
  }
  const discountAmount = roundMoney(parseAmount(data.discount_amount));
  if (discountAmount < 0) throw new AppError('Invoice discount cannot be negative');
  if (items.length && discountAmount > itemsTotal) {
    throw new AppError('Invoice discount cannot exceed invoice total');
  }
  // الضريبة: تُحسب بنفس منطق مسار الفواتير (tax_enabled + tax_percent) لتوحيد المعاملة
  // عبر كل المسارات. عند عدم إرسال القيم تبقى صفرًا (السلوك السابق).
  const taxPercent = Math.max(0, parseAmount(data.tax_percent ?? 0));
  const taxableBase = Math.max(0, itemsTotal - discountAmount);
  const taxAmount = data.tax_enabled ? roundMoney((taxableBase * taxPercent) / 100) : 0;
  const dailyTotal = roundMoney(parseAmount(data.total_amount));
  const totalAmount = items.length
    ? roundMoney(Math.max(0, taxableBase + taxAmount))
    : dailyTotal;
  return {
    items: normalizedItems,
    subtotal,
    itemDiscountTotal,
    discountAmount,
    taxAmount,
    taxPercent,
    totalAmount,
  };
};

/**
 * حساب المبلغ المدفوع الفعلي حسب حالة الدفع.
 * @param {string} [paymentStatus] حالة الدفع (paid/partial/unpaid)
 * @param {number} totalAmount إجمالي الفاتورة
 * @param {number} [rawPaidAmount] المبلغ المدفوع الخام
 * @returns {number}
 */
const calculatePaidAmount = (
  paymentStatus: string = 'paid',
  totalAmount: number,
  rawPaidAmount: number = 0,
) => {
  if (!['paid', 'partial', 'unpaid'].includes(paymentStatus)) {
    throw new AppError('Invalid payment status');
  }
  if (paymentStatus === 'unpaid') return 0;
  if (paymentStatus === 'paid') return roundMoney(totalAmount);
  const paidAmount = roundMoney(parseAmount(rawPaidAmount));
  if (paidAmount <= 0) throw new AppError('Partial payment amount must be greater than zero');
  if (paidAmount >= totalAmount)
    throw new AppError('Partial payment amount must be less than invoice total');
  return paidAmount;
};

/**
 * حساب المبلغ المتبقي غير المدفوع.
 * @param {number} totalAmount إجمالي الفاتورة
 * @param {number} [paidAmount] المبلغ المدفوع
 * @returns {number}
 */
const calculateOutstandingAmount = (totalAmount: number, paidAmount: number = 0) =>
  roundMoney(Math.max(0, parseAmount(totalAmount) - parseAmount(paidAmount)));

/** تسميات أنواع البيع بالعربية (للنشاط/السجلات). */
const SALE_TYPES = {
  branch: '\u0641\u0631\u0639',
  wholesale: '\u062C\u0645\u0644\u0629',
  pos: 'POS',
};

export { calculateOutstandingAmount, calculatePaidAmount, calculateSaleTotals, SALE_TYPES };
