/**
 * salesCalculations.ts — أدوات الحساب النقيّة لدورة المبيعات
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
    if (!productId) throw new AppError(`البند ${idx + 1}: يجب تحديد المنتج`);
    if (quantity <= 0) throw new AppError(`البند ${idx + 1}: يجب أن تكون الكمية أكبر من صفر`);
    if (unitPrice < 0) throw new AppError(`البند ${idx + 1}: لا يمكن أن يكون سعر الوحدة سالباً`);
    if (discountAmount2 < 0)
      throw new AppError(`البند ${idx + 1}: لا يمكن أن تكون قيمة الخصم سالبة`);
    const grossLineTotal = roundMoney(quantity * unitPrice);
    if (discountAmount2 > grossLineTotal) {
      throw new AppError(`البند ${idx + 1}: قيمة الخصم لا يمكن أن تتجاوز إجمالي البند`);
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
  if (discountAmount < 0) throw new AppError('قيمة خصم الفاتورة لا يمكن أن تكون سالبة');
  if (items.length && discountAmount > itemsTotal) {
    throw new AppError('قيمة خصم الفاتورة لا يمكن أن تتجاوز إجمالي الفاتورة');
  }
  const taxPercent =
    data.tax_percent !== undefined && data.tax_percent !== null
      ? Math.max(0, roundMoney(parseAmount(data.tax_percent)))
      : 0;
  const baseForTax = Math.max(0, itemsTotal - discountAmount);
  const taxAmount =
    data.tax_amount !== undefined && data.tax_amount !== null
      ? roundMoney(parseAmount(data.tax_amount))
      : taxPercent > 0
        ? roundMoney((baseForTax * taxPercent) / 100)
        : 0;

  const dailyTotal = roundMoney(parseAmount(data.total_amount));
  const totalAmount = items.length
    ? roundMoney(Math.max(0, itemsTotal - discountAmount + taxAmount))
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
    throw new AppError('حالة الدفع المحددة غير صحيحة');
  }
  if (paymentStatus === 'unpaid') return 0;
  if (paymentStatus === 'paid') return roundMoney(totalAmount);
  const paidAmount = roundMoney(parseAmount(rawPaidAmount));
  if (paidAmount <= 0) throw new AppError('المبلغ المدفوع جزئياً يجب أن يكون أكبر من صفر');
  if (paidAmount >= totalAmount)
    throw new AppError('المبلغ المدفوع جزئياً يجب أن يكون أقل من إجمالي الفاتورة');
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

/** مجموع المدفوعات المتعددة مع منع تجاوز إجمالي الفاتورة. */
const calculatePaymentTotal = (
  payments: Array<{ amount: number | string }>,
  totalAmount: number,
) => {
  const paymentTotal = sumMoney(...payments.map((payment) => payment.amount));
  if (paymentTotal > totalAmount) {
    throw new AppError('إجمالي المدفوعات لا يمكن أن يتجاوز إجمالي الفاتورة', 400);
  }
  return paymentTotal;
};

/** تسميات أنواع البيع بالعربية (للنشاط/السجلات). */
const SALE_TYPES = {
  branch: '\u0641\u0631\u0639',
  wholesale: '\u062C\u0645\u0644\u0629',
  pos: 'POS',
};

export {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculatePaymentTotal,
  calculateSaleTotals,
  SALE_TYPES,
};
