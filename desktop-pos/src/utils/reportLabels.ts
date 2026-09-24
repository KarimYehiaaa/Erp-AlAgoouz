/**
 * أدوات تنسيق مساعدة مشتركة بين تبويبات التقارير:
 * تحويل الأكواد إلى تسميات عربية + تنسيق الكميات.
 */

/** تسمية نوع البيع (retail/wholesale/pos) بالعربية. */
export const saleTypeLabel = (t: any) =>
  (({ retail: 'المحل', wholesale: 'جملة', pos: 'POS' }) as Record<string, string>)[t] || t || '—';

/** تسمية نوع العميل (retail/wholesale) بالعربية. */
export const customerTypeLabel = (t: any) =>
  (({ retail: 'تجزئة', wholesale: 'جملة' }) as Record<string, string>)[t] || t || '—';

/** تسمية حالة فاتورة الشراء (paid/pending/partial) بالعربية. */
export const purchaseStatusLabel = (s: any) =>
  (({ paid: 'مدفوع', pending: 'معلق', partial: 'جزئي' }) as Record<string, string>)[s] || s || '—';

/** تسمية حالة الدفع (unpaid/partial/paid) بالعربية. */
export const paymentStatusLabel = (s: any) =>
  (({ unpaid: 'غير مدفوع', partial: 'جزئي', paid: 'مدفوع' }) as Record<string, string>)[s] ||
  s ||
  '—';

/** تنسيق الكمية: عدد صحيح بفواصل الآلاف، وكسري برقمين. */
export const fmtQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(2);
};
