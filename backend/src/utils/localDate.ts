/**
 * localDate.ts — أدوات التاريخ المحلي بتوقيت الشركة
 * ════════════════════════════════════════════════
 * تُستخدم بدلاً من toISOString().split('T')[0] الذي يعتمد على UTC
 * ويسجل المبيعات بعد منتصف الليل (بتوقيت القاهرة) على اليوم السابق.
 */

/** المنطقة الزمنية الرسمية للشركة */
export const BUSINESS_TIMEZONE = 'Africa/Cairo';

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** تاريخ اليوم بتوقيت الشركة بصيغة YYYY-MM-DD */
export const businessToday = () => businessDateFormatter.format(new Date());
