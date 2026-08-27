/**
 * tafqeet.ts — تفقيط المبالغ المالية (تحويل الأرقام إلى كلمات عربية)
 * يدعم المبالغ حتى التريليونات مع الكسور (قروش) بالصيغة المصرية المعتمدة.
 * أمثلة:
 *   tafqeet(0)        → "فقط صفر جنيه مصري لا غير"
 *   tafqeet(1000)     → "فقط ألف جنيه مصري لا غير"
 *   tafqeet(2000)     → "فقط ألفان جنيه مصري لا غير"  (ملاحظة: تُصرف للجنيهات)
 *   tafqeet(150.75)   → "فقط مائة وخمسون جنيه مصري وخمسة وسبعون قرشاً لا غير"
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];

const TEENS = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

/** صيغ المجموعات الثلاثية: [المفرد، المثنى، الجمع (3-10)، المبني للمجرهول (>10)] */
const GROUPS = [
  { singular: '', dual: '', few: '', many: '' }, // الآحاد — بلا لفظ
  { singular: 'ألف', dual: 'ألفان', few: 'آلاف', many: 'ألف' },
  { singular: 'مليون', dual: 'مليونان', few: 'ملايين', many: 'مليون' },
  { singular: 'مليار', dual: 'ملياران', few: 'مليارات', many: 'مليار' },
  { singular: 'تريليون', dual: 'تريليونان', few: 'تريليونات', many: 'تريليون' },
];

/** تحويل رقم من 1 إلى 999 إلى كلمات. */
const threeDigitsToWords = (n: number): string => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds > 0) parts.push(HUNDREDS[hundreds] ?? '');

  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10] ?? '');
  } else {
    const ones = rest % 10;
    const tens = Math.floor(rest / 10);
    if (ones > 0) parts.push(ONES[ones] ?? '');
    if (tens > 1) parts.push(TENS[tens] ?? '');
  }

  return parts.join(' و');
};

/** تحويل عدد صحيح غير سالب إلى كلمات عربية. */
export const integerToArabicWords = (value: number): string => {
  const num = Math.floor(Math.abs(value));
  if (num === 0) return 'صفر';
  if (!Number.isFinite(num)) return '';

  // تقسيم الرقم إلى مجموعات ثلاثية من اليمين لليسار
  const groups: number[] = [];
  let remaining = num;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const phrases: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] ?? 0;
    if (g === 0) continue;

    const group = GROUPS[i] ?? GROUPS[GROUPS.length - 1]!;
    if (!group) continue;

    if (i === 0) {
      // مجموعة الآحاد تُكتب كما هي
      phrases.push(threeDigitsToWords(g));
    } else if (g === 1) {
      phrases.push(group.singular);
    } else if (g === 2) {
      phrases.push(group.dual);
    } else if (g <= 10) {
      phrases.push(`${threeDigitsToWords(g)} ${group.few}`);
    } else {
      phrases.push(`${threeDigitsToWords(g)} ${group.many}`);
    }
  }

  return phrases.join(' و');
};

/**
 * تفقيط مبلغ مالي كامل بالجنيه المصري والقروش.
 * @param amount المبلغ (يقبل الأرقام العربية/النصوص عبر Number)
 * @param currency اسم العملة (افتراضي: جنيه مصري)
 * @param subunit اسم وحدة الكسر (افتراضي: قرش)
 * @returns النص القانوني جاهز للطباعة
 */
export const tafqeet = (amount: any, currency = 'جنيه مصري', subunit = 'قرش'): string => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';

  const sign = value < 0 ? 'سالب ' : '';
  const abs = Math.abs(value);

  let pounds = Math.floor(abs);
  let piasters = Math.round((abs - pounds) * 100);
  if (piasters === 100) {
    pounds += 1;
    piasters = 0;
  }

  let result = `فقط ${sign}${integerToArabicWords(pounds)} ${currency}`;
  if (piasters > 0) {
    result += ` و${integerToArabicWords(piasters)} ${subunit}اً`;
  }
  result += ' لا غير';

  return result;
};
