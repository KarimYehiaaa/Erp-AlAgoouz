/**
 * statusMeta.ts — المصدر الموحد لتسميات وألوان حالات السجلات.
 * تستخدمه مكوّن StatusBadge ودوال البادجات القديمة في الشاشات حتى لا تتكرر الخرائط.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/** حالات سداد المبيعات والفواتير */
const PAYMENT_STATUS: Record<string, StatusMeta> = {
  paid: { label: 'مدفوعة', tone: 'success' },
  partial: { label: 'مدفوعة جزئياً', tone: 'warning' },
  unpaid: { label: 'غير مدفوعة', tone: 'danger' },
  refunded: { label: 'مستردة', tone: 'info' },
};

/** حالات العملية (بيع/جرد/فاتورة) */
const RECORD_STATUS: Record<string, StatusMeta> = {
  completed: { label: 'مكتملة', tone: 'success' },
  returned: { label: 'مرتجعة', tone: 'info' },
  cancelled: { label: 'ملغاة', tone: 'neutral' },
  draft: { label: 'مسودة', tone: 'warning' },
};

const FALLBACK: StatusMeta = { label: '—', tone: 'neutral' };

export const resolveStatusMeta = (kind: string, status: any): StatusMeta => {
  const code = String(status || '').toLowerCase();
  const map = kind === 'payment' ? PAYMENT_STATUS : RECORD_STATUS;
  return map[code] ?? FALLBACK;
};
