-- Migration: 081_enhance_automation_agents.sql
-- Description: تنظيف وتحديث أوصاف ومسارات وكلاء الأتمتة بعد توصيل معالجات التنفيذ الكاملة

-- 1. إزالة عبارة الإيقاف السابقة من الأوصاف
UPDATE automations
SET description_ar = TRIM(
      REPLACE(
        REPLACE(description_ar, E'\nموقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.', ''),
        'موقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.',
        ''
      )
    ),
    updated_at = NOW()
WHERE description_ar LIKE '%موقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.%';

-- 2. تحديث وتدقيق مسميات وأوصاف المهام الرئيسية
UPDATE automations
SET name_ar = 'كشف إلغاء الفواتير والعمليات الملغاة',
    description_ar = 'رصد فوري لأي فاتورة يتم إلغاؤها بعد إصدارها وإرسال تنبيه للإدارة لمكافحة التلاعب والاحتيال.',
    category = 'security',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'void_invoice_alert';

UPDATE automations
SET name_ar = 'تنبيه الخصومات المرتفعة الاستثنائية',
    description_ar = 'مراقبة فورية لأي خصم يتجاوز 15% على المبيعات وتنبيه الإدارة للتحقق من هوامش الربح وصلاحيات الخصم.',
    category = 'security',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'large_discount_alert';

UPDATE automations
SET name_ar = 'مطابقة عهدة الكاشير وإغلاق الورديات',
    description_ar = 'مطابقة النقدية المستلمة في درج الكاشير مع مبيعات الوردية المسجلة وتنبيه الإدارة عند وجود أي عجز أو زيادة نقدية.',
    category = 'security',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'shift_handover_reconciliation';

UPDATE automations
SET name_ar = 'درع حماية السيولة والتدفقات النقدية',
    description_ar = 'تنبؤ استباقي بالرصيد النقدي والالتزامات القادمة لـ 30 يوماً وتنبيه الإدارة مبكراً عند توقع أي عجز في السيولة.',
    category = 'sales',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'cashflow_risk_shield';

UPDATE automations
SET name_ar = 'حارس الهدر والفاقد لخامات التحميص والبار',
    description_ar = 'متابعة استهلاك خامات البن والحليب والمستلزمات ورصد حركات التالف والهدر غير الطبيعي لحماية التكاليف.',
    category = 'inventory',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'roastery_recipe_waste_guard';

UPDATE automations
SET name_ar = 'حملة استعادة وتنشيط العملاء المنقطعين',
    description_ar = 'رصد عملاء المحل الدائمين المنقطعين عن الشراء لأكثر من 30 يوماً واقتراح عروض نقاط ولاء لتشجيع عودتهم.',
    category = 'sales',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'customer_loyalty_dormant_winback';

UPDATE automations
SET name_ar = 'المساعد التحليلي الذكي Gemini Copilot',
    description_ar = 'تحليل ذكي يومي لمؤشرات أداء المبيعات والمخزون وتقديم توصيات تنفيذية سريعة لمدير المحل.',
    category = 'system',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'ai_copilot_assistant';
