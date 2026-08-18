/**
 * أدوات تنسيق مساعدة مشتركة بين تبويبات التقارير:
 * تحويل الأكواد إلى تسميات عربية + تنسيق الكميات.
 */

/** تسمية نوع البيع (branch/wholesale/pos) بالعربية. */
export const saleTypeLabel = (t: any) =>
  (({ branch: 'فرع', wholesale: 'جملة', pos: 'POS' }) as Record<string, string>)[t] || t || '—';

/** تسمية نوع العميل (retail/wholesale) بالعربية. */
export const customerTypeLabel = (t: any) =>
  (({ retail: 'تجزئة', wholesale: 'جملة' }) as Record<string, string>)[t] || t || '—';

/** تسمية حالة فاتورة الشراء (paid/pending/partial) بالعربية. */
export const purchaseStatusLabel = (s: any) =>
  (({ paid: 'مدفوع', pending: 'معلق', partial: 'جزئي' }) as Record<string, string>)[s] || s || '—';

/** تسمية حالة الدفع (unpaid/partial/paid/refunded) بالعربية. */
export const paymentStatusLabel = (s: any) =>
  ((
    {
      unpaid: 'غير مدفوع',
      partial: 'جزئي',
      paid: 'مدفوع',
      refunded: 'مسترد (مرتجع)',
    } as Record<string, string>
  ))[s] ||
  s ||
  '—';

/** تنسيق الكمية: عدد صحيح بفواصل الآلاف، وكسري برقمين. */
export const fmtQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(2);
};
