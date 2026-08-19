/**
 * utils/urlValidator.ts — حماية من هجمات تزوير الطلبات من جانب الخادم (SSRF)
 * ═══════════════════════════════════════════════════════════════════════════
 * يتحقق من أن أي رابط خارجي (External URL أو Webhook) لا يستهدف الشبكة الداخلية،
 * أو عناوين localhost أو Metadata endpoints للخدمات السحابية.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '169.254.169.254', // AWS / Cloud metadata
  'metadata.google.internal',
]);

const PRIVATE_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // 127.0.0.0/8
  /^169\.254\./, // Link-local
  /^fc00:/i, // IPv6 Unique Local Address
  /^fe80:/i, // IPv6 Link-Local
];

/**
 * التحقق من أمان الرابط الخارجي لمنع SSRF
 * @param urlString الرابط المراد فحصه
 * @returns boolean صحيح إذا كان الرابط آمناً وخارجياً
 */
export function isSafeExternalUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);

    // السماح فقط ببروتوكولات HTTP و HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // فحص النطاقات المحظورة صراحة
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return false;
    }

    // فحص عناوين IP الخاصة
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
