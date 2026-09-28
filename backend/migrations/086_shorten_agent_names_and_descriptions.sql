-- Migration: 086_shorten_agent_names_and_descriptions.sql
-- Description: تبسيط واختصار أسماء وأوصاف وكلاء الأتمتة وعقد سير العمل لتكون رشيقة ومريحة بصرياً في الكروت.

-- 1. تحديث أسماء وأوصاف وكلاء الأتمتة لتكون قصيرة ومركزة
UPDATE automations SET 
  name_ar = 'ملخص المبيعات اليومي',
  description_ar = 'تجميع مبيعات وأرباح ومصروفات اليوم وإرسالها ليلاً للمالك.'
WHERE key = 'daily_sales_report';

UPDATE automations SET 
  name_ar = 'نواقص خامات البن',
  description_ar = 'رصد الخامات والأصناف التي بلغت حد إعادة الطلب وتنبيه الإدارة.'
WHERE key = 'low_stock_alert';

UPDATE automations SET 
  name_ar = 'كاشف الفواتير الملغاة',
  description_ar = 'إنذار فوري عند إلغاء أي فاتورة بيع بعد إصدارها لمنع التلاعب.'
WHERE key = 'void_invoice_alert';

UPDATE automations SET 
  name_ar = 'حارس مكافحة الاحتيال',
  description_ar = 'تدقيق يومي للعمليات الملغاة والخصومات الاستثنائية لحماية الإيراد.'
WHERE key = 'anti_fraud_sentinel';

UPDATE automations SET 
  name_ar = 'تنبيه الخصم المرتفع',
  description_ar = 'رصد فوري لأي خصم يتجاوز 15% مع توضيح اسم الكاشير.'
WHERE key = 'large_discount_alert';

UPDATE automations SET 
  name_ar = 'توازن المخازن والمناقلات',
  description_ar = 'اقتراح مناقلة البضاعة من المخزن الفائض إلى المخزن المحتاج.'
WHERE key = 'warehouse_balancing';

UPDATE automations SET 
  name_ar = 'سلامة السيرفر والقاعدة',
  description_ar = 'فحص دوري لسرعة استجابة قاعدة البيانات واستقرار خدمات الخادم.'
WHERE key = 'system_health';

UPDATE automations SET 
  name_ar = 'فاحص النسخ الاحتياطي',
  description_ar = 'مراقبة عمر وجودة آخر نسخة احتياطية وتأكيد سلامة ملفاتها.'
WHERE key = 'daily_backup_reminder';

UPDATE automations SET 
  name_ar = 'مستحقات الموردين',
  description_ar = 'تنبيه مبكر قبل موعد استحقاق فواتير الموردين بـ 3 أيام.'
WHERE key = 'supplier_payment_due_alert';

UPDATE automations SET 
  name_ar = 'مراقب هامش الربح',
  description_ar = 'إنذار فوري عند هبوط متوسط هامش الربح اليومي عن 28%.'
WHERE key = 'daily_profit_margin_anomaly';

UPDATE automations SET 
  name_ar = 'درع السيولة النقدية',
  description_ar = 'تنبؤ برصيد 30 يوماً والإنذار المبكر عند توقع أي عجز نقدي.'
WHERE key = 'cashflow_risk_shield';

UPDATE automations SET 
  name_ar = 'مطابقة عهدة الورديات',
  description_ar = 'مطابقة نقدية الدرج مع مبيعات الشيفت وتنبيه الإدارة عند أي عجز.'
WHERE key = 'shift_handover_reconciliation';

UPDATE automations SET 
  name_ar = 'حارس هدر الخامات والبار',
  description_ar = 'رصد حركات التالف والهدر في خامات البن والحليب والمستلزمات.'
WHERE key = 'roastery_recipe_waste_guard';

UPDATE automations SET 
  name_ar = 'استعادة العملاء المنقطعين',
  description_ar = 'رصد عملاء المحل المنقطعين لأكثر من 30 يوماً وتنشيطهم بالعروض.'
WHERE key = 'customer_loyalty_dormant_winback';

UPDATE automations SET 
  name_ar = 'المساعد الذكي Gemini',
  description_ar = 'تحليل يومي ذكي لمؤشرات الأداء وتقديم توصيات تشغيلية سريعة.'
WHERE key = 'ai_copilot_assistant';

UPDATE automations SET 
  name_ar = 'كاشف الأخطاء البرمجية',
  description_ar = 'رصد فوري لاستثناءات السيرفر وقاعدة البيانات وإرسال تشخيص سريع.'
WHERE key = 'error_tracker_alert';

UPDATE automations SET 
  name_ar = 'مدير المهام المجدولة',
  description_ar = 'متابعة نبض وجدولة كافة المهام الدورية والتحقق من انتظامها.'
WHERE key = 'scheduled_cron_task';

UPDATE automations SET 
  name_ar = 'إشعارات تليجرام',
  description_ar = 'فحص اتصال بوت تليجرام وجاهزيته لإرسال التقارير الفورية للمالك.'
WHERE key = 'telegram_notifier';

UPDATE automations SET 
  name_ar = 'مستمع Webhook الخارجي',
  description_ar = 'مراقبة نقاط الاستقبال للطلبات الخارجية والتحقق من جاهزيتها.'
WHERE key = 'webhook_listener';

UPDATE automations SET 
  name_ar = 'حارس المديونيات والائتمان',
  description_ar = 'رصد مديونيات العملاء والموردين وتنبيه الإدارة عند تجاوز الائتمان.'
WHERE key = 'debt_credit_sentinel';

UPDATE automations SET 
  name_ar = 'حارس المشتريات والمخزن',
  description_ar = 'تأكيد ترحيل المشتريات للمخزن وتنبيه الإدارة عند ارتفاع التكلفة.'
WHERE key = 'purchase_stock_ingestion_guard';

UPDATE automations SET 
  name_ar = 'مطابق الأكواب وأكياس البن',
  description_ar = 'مطابقة عدد الأكواب والمشروبات المباعة وتدقيق أكياس البن لمنع الهدر.'
WHERE key = 'coffee_bags_cups_reconciler';

-- 2. تحديث أسماء العقد على خريطة الكانفاس لتكون مدمجة وواضحة جداً
UPDATE workflows_nodes SET label_ar = 'كاشير POS' WHERE id = 1;
UPDATE workflows_nodes SET label_ar = 'المخزن الرئيسي' WHERE id = 2;
UPDATE workflows_nodes SET label_ar = 'محرك الوصفات' WHERE id = 3;
UPDATE workflows_nodes SET label_ar = 'وكيل تليجرام' WHERE id = 4;
UPDATE workflows_nodes SET label_ar = 'المساعد Gemini' WHERE id = 5;
UPDATE workflows_nodes SET label_ar = 'إشعارات النظام' WHERE id = 6;
UPDATE workflows_nodes SET label_ar = 'إدخال يدوي' WHERE id = 7;
UPDATE workflows_nodes SET label_ar = 'فاتورة جملة' WHERE id = 8;
UPDATE workflows_nodes SET label_ar = 'تقرير الكاشير' WHERE id = 9;
UPDATE workflows_nodes SET label_ar = 'خصم مخزون مباشر' WHERE id = 10;
UPDATE workflows_nodes SET label_ar = 'حساب الوصفات' WHERE id = 11;
UPDATE workflows_nodes SET label_ar = 'تحديث المخزن' WHERE id = 12;
UPDATE workflows_nodes SET label_ar = 'وكيل المديونيات' WHERE id = 13;
UPDATE workflows_nodes SET label_ar = 'وكيل المشتريات' WHERE id = 14;
UPDATE workflows_nodes SET label_ar = 'مطابق الأكواب والبن' WHERE id = 15;
