import { query } from '../database/pool.ts';

/**
 * جلب مؤشرات النظام وتوليد سياق للذكاء الاصطناعي
 */
const getErpContext = async () => {
  try {
    // 1. مبيعات آخر 30 يوم
    const salesSql = `
      SELECT 
        COALESCE(SUM(total_amount), 0) AS revenue,
        COALESCE(SUM(profit_amount), 0) AS profit,
        COUNT(*) AS count
      FROM sales
      WHERE status = 'completed' AND deleted_at IS NULL
        AND sale_date >= CURRENT_DATE - INTERVAL '30 days'
    `;
    const salesStats = (await query(salesSql)).rows[0];

    // 2. المنتجات الأكثر مبيعاً
    const topProdSql = `
      SELECT p.name_ar, SUM(si.quantity) AS qty, p.unit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status = 'completed' AND s.deleted_at IS NULL
        AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY p.name_ar, p.unit
      ORDER BY qty DESC
      LIMIT 5
    `;
    const topProducts = (await query(topProdSql)).rows;
    const topProductsText =
      topProducts.length > 0
        ? topProducts.map((p) => `${p.name_ar} (${Number(p.qty)} ${p.unit})`).join('، ')
        : 'لا توجد مبيعات مسجلة في آخر 30 يوماً';

    // 3. المنتجات منخفضة المخزون
    const lowStockSql = `
      SELECT p.name_ar, COALESCE(SUM(i.quantity), 0) AS stock, p.unit
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, p.name_ar, p.unit
      HAVING COALESCE(SUM(i.quantity), 0) <= 10
      ORDER BY stock ASC
      LIMIT 5
    `;
    const lowStock = (await query(lowStockSql)).rows;
    const lowStockText =
      lowStock.length > 0
        ? lowStock.map((p) => `${p.name_ar} (الرصيد: ${Number(p.stock)} ${p.unit})`).join('، ')
        : 'جميع السلع مخزونها مستقر وآمن';

    // 4. مصروفات آخر 30 يوم
    const expSql = `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE deleted_at IS NULL AND expense_date >= CURRENT_DATE - INTERVAL '30 days'
    `;
    const expenseStats = (await query(expSql)).rows[0];

    // 5. إجمالي ديون ومستحقات العملاء
    const custSql = `
      SELECT COALESCE(SUM(balance), 0) AS total
      FROM customers
      WHERE deleted_at IS NULL
    `;
    const customerStats = (await query(custSql)).rows[0];

    return {
      sales: salesStats,
      topProducts: topProductsText,
      lowStock: lowStockText,
      expenses: expenseStats,
      customers: customerStats,
    };
  } catch (err: any) {
    console.error('⚠️ فشل جلب سياق الـ ERP للـ Copilot:', err.message);
    return null;
  }
};

/**
 * معالجة رسائل المستخدم والإرسال لـ Gemini API
 */
/**
 * استدعاء المساعد الذكي بالإجابة على استفسار المستخدم مع سياق المحادثة.
 * @param {string} userPrompt نص سؤال المستخدم
 * @param {any[]} [chatHistory] تاريخ المحادثة السابقة
 * @returns {Promise<{ text: string, suggestions?: string[] }>}
 */
export const askCopilot = async (userPrompt: string, chatHistory: any[] = []) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY') {
    return 'عذراً، لم يتم العثور على مفتاح الربط للذكاء الاصطناعي (GEMINI_API_KEY) في إعدادات ملف `.env`. يرجى إضافة المفتاح المناسب لتفعيل المساعد الذكي والدردشة التفاعلية.';
  }

  // 1. جلب مؤشرات النظام اللحظية
  const erp = await getErpContext();

  // 2. صياغة التوجيه البرمجي للـ LLM (System Instruction)
  const systemInstruction = `
أنت المساعد الذكي والمالي لنظام إدارة ERP "بن العجوز" (AlAgoouz ERP).
تتحدث باللغة العربية بأسلوب لبق ومحاسبي ومهني مبسط.
تساعد المدير في اتخاذ القرارات الإدارية والمالية بناءً على أرقام النظام.

إليك تقرير الأداء اللحظي الحالي للنظام لآخر 30 يوماً لمساعدتك في إجاباتك:
- إحصائيات المبيعات: إجمالي المبيعات = ${erp?.sales?.revenue || 0} ج.م، الأرباح الصافية = ${erp?.sales?.profit || 0} ج.م، عدد الفواتير = ${erp?.sales?.count || 0}.
- المنتجات الأكثر مبيعاً: ${erp?.topProducts || 'لا يوجد'}.
- نواقص المخزون الحرجة: ${erp?.lowStock || 'المخزون سليم'}.
- المصروفات والتشغيل: إجمالي المصاريف = ${erp?.expenses?.total || 0} ج.م.
- ديون ومستحقات العملاء: إجمالي المديونية = ${erp?.customers?.total || 0} ج.م.

توجيهات الإجابة:
1. استخدم البيانات السابقة حصرياً عند الاستفسار عن مبيعاتك وأرباحك ومخزنك.
2. إذا سألك المستخدم أسئلة عامة عن كيفية تحسين مبيعات الكوفي شوب، تحميص البن، وصفات القهوة، أو كيفية إدارة الأعمال، أجب بذكاء اعتماداً على خبرتك الواسعة كخبير استشاري تجاري.
3. أجب باختصار منسق، واستخدم القوائم المنقطة أو الجداول إذا كانت الأرقام متعددة، لتكون القراءة سريعة ومريحة على شاشات الموبايل والكمبيوتر.
`;

  // 3. بناء هيكلية طلب Gemini API
  const formattedHistory = chatHistory.map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content || h.text || '' }],
  }));

  const contents = [
    ...formattedHistory,
    {
      role: 'user',
      parts: [{ text: `${systemInstruction}\n\nالسؤال الحالي للمستخدم: ${userPrompt}` }],
    },
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      },
    );

    const resData = await response.json();

    if (resData.error) {
      console.error('Gemini API error:', resData.error);
      return `حدث خطأ أثناء التواصل مع سيرفر الذكاء الاصطناعي: ${resData.error.message}`;
    }

    const replyText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    return replyText || 'لم أتمكن من صياغة إجابة مناسبة حالياً، يرجى المحاولة لاحقاً.';
  } catch (err: any) {
    console.error('❌ فشل استدعاء Gemini API:', err.message);
    return 'لا يمكن الاتصال بسيرفر الذكاء الاصطناعي حالياً، تأكد من اتصال الإنترنت وصلاحية مفتاح API الخاص بك.';
  }
};
