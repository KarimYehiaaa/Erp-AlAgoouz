/**
 * roundMoney — تقريب المبالغ المالية لخانتين عشريتين
 * (يمنع تراكم أخطاء الفاصلة العائمة مثل 0.1 + 0.2 = 0.30000000000000004)
 */
export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;
