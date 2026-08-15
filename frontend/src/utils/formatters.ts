/**
 * formatters.js — دوال تنسيق البيانات المشتركة في كل النظام
 *
 * يشمل:
 * - تنسيق العملة والأرقام
 * - تنسيق التواريخ بالعربي
 * - اختصار الأرقام الكبيرة (1500 → 1.5K)
 * - تنسيق النسب المئوية
 * - تنسيق الحالات (badges)
 */

import { CURRENCY } from './currency';

// ─── Currency ──────────────────────────────────────────────────────────
export { formatMoney, formatNumber, CURRENCY } from './currency';

/**
 * اختصار الأرقام الكبيرة
 * 1500 → 1.5K | 1,500,000 → 1.5M
 */
export const abbreviateNumber = (value: any) => {
  const num = Number(value || 0);
  if (isNaN(num)) return '—';
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
};

/**
 * اختصار المبالغ المالية مع العملة
 * 15000 → 15K ج.م
 */
export const abbreviateMoney = (value: any) => {
  const num = Number(value || 0);
  return `${abbreviateNumber(num)} ${CURRENCY.symbol}`;
};

// ─── Percentage ────────────────────────────────────────────────────────
/**
 * تنسيق النسبة المئوية
 * 0.756 → '75.6%' | 1.0 → '100%'
 */
export const formatPercent = (value: any, decimals = 1) => {
  const num = Number(value || 0);
  if (isNaN(num)) return '—';
  const pct = num <= 1 ? num * 100 : num;
  return `${pct.toFixed(decimals)}%`;
};

// ─── Dates ─────────────────────────────────────────────────────────────
const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** خيارات تنسيق التاريخ. */
export interface DateFormatOptions {
  short?: boolean;
  monthYear?: boolean;
  dayName?: boolean;
}

/**
 * تنسيق التاريخ بالعربي
 * '2025-01-15' → '15 يناير 2025'
 * @param {any} value التاريخ (نص أو Date)
 * @param {DateFormatOptions} [options] خيارات التنسيق
 * @returns {string} التاريخ المنسق
 */
export const formatDate = (value: any, options: DateFormatOptions = {}) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate();
  const month = AR_MONTHS[d.getMonth()];
  const year = d.getFullYear();

  if (options.short) return `${day}/${d.getMonth() + 1}/${year}`;
  if (options.monthYear) return `${month} ${year}`;
  if (options.dayName) return `${AR_DAYS[d.getDay()]}، ${day} ${month} ${year}`;
  return `${day} ${month} ${year}`;
};

/**
 * تنسيق التاريخ والوقت
 * '2025-01-15T14:30:00' → '15 يناير 2025، 2:30 م'
 */
export const formatDateTime = (value: any) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const datePart = formatDate(value);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${datePart}، ${h12}:${m} ${period}`;
};

/**
 * الوقت النسبي (منذ كم)
 * '2025-01-15T10:00:00' → 'منذ 3 ساعات'
 */
export const timeAgo = (value: any) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';

  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);

  if (diff < 60) return 'للتو';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 2592000) return `منذ ${Math.floor(diff / 86400)} يوم`;
  if (diff < 31536000) return `منذ ${Math.floor(diff / 2592000)} شهر`;
  return `منذ ${Math.floor(diff / 31536000)} سنة`;
};

// ─── Text ──────────────────────────────────────────────────────────────
/**
 * اقتطاع النص مع ...
 */
export const truncate = (text: any, length = 50) => {
  if (!text) return '—';
  return text.length > length ? `${text.substring(0, length)}...` : text;
};

// ─── Status Badges ─────────────────────────────────────────────────────
const STATUS_MAP = {
  // Payment
  paid: { label: 'مدفوع', class: 'badge-success' },
  partial: { label: 'جزئي', class: 'badge-warning' },
  unpaid: { label: 'غير مدفوع', class: 'badge-danger' },
  pending: { label: 'معلق', class: 'badge-warning' },
  // General
  active: { label: 'نشط', class: 'badge-success' },
  inactive: { label: 'غير نشط', class: 'badge-muted' },
  draft: { label: 'مسودة', class: 'badge-muted' },
  confirmed: { label: 'مؤكد', class: 'badge-success' },
  cancelled: { label: 'ملغي', class: 'badge-danger' },
  // Inventory
  in_stock: { label: 'متوفر', class: 'badge-success' },
  low_stock: { label: 'منخفض', class: 'badge-warning' },
  out_of_stock: { label: 'نفد', class: 'badge-danger' },
  // HR
  present: { label: 'حاضر', class: 'badge-success' },
  absent: { label: 'غائب', class: 'badge-danger' },
  late: { label: 'متأخر', class: 'badge-warning' },
};

/**
 * جلب بيانات الـ badge حسب الحالة
 */
export const getStatusBadge = (status: any) => {
  return (
    STATUS_MAP[(status?.toLowerCase() || '') as keyof typeof STATUS_MAP] || {
      label: status || '—',
      class: 'badge-muted',
    }
  );
};

// ─── Phone ─────────────────────────────────────────────────────────────
/**
 * تنسيق رقم الهاتف المصري
 * '01012345678' → '010 1234 5678'
 */
export const formatPhone = (phone: any) => {
  if (!phone) return '—';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 11) return `${clean.slice(0, 3)} ${clean.slice(3, 7)} ${clean.slice(7)}`;
  return phone;
};
