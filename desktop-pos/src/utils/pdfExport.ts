/**
 * تصدير عنصر DOM إلى ملف PDF عبر html2pdf.js (يُحمَّل ديناميكياً).
 * نقطة واحدة موحدة بدل النسخ المكررة في الشاشات المتعددة.
 */
export interface PdfExportOptions {
  /** العنصر المستهدف أو محدد CSS */
  element: Element | string;
  /** اسم الملف الناتج */
  filename: string;
  /** الهوامش بالمليمتر (افتراضي 8مم من كل جهة) */
  margin?: number | [number, number, number, number];
  /** دقة الالتقاط (افتراضي 2) */
  scale?: number;
  /** جودة الصورة (افتراضي 0.95) */
  quality?: number;
  /** لون الخلفية (بعض الثيمات الداكنة تحتاج تحديده صراحةً) */
  backgroundColor?: string;
}

export const exportElementToPdf = async ({
  element,
  filename,
  margin = [8, 8, 8, 8],
  scale = 2,
  quality = 0.95,
  backgroundColor,
}: PdfExportOptions): Promise<void> => {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) throw new Error('العنصر المستهدف للتصدير غير موجود');

  const module = await import('html2pdf.js');
  const html2pdf = ((module as any).default || module) as any;

  await html2pdf()
    .set({
      margin,
      filename,
      image: { type: 'jpeg', quality },
      html2canvas: {
        scale,
        useCORS: true,
        logging: false,
        ...(backgroundColor ? { backgroundColor } : {}),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save();
};
