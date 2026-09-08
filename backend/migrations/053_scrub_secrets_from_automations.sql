-- Migration: 053_scrub_secrets_from_automations.sql
-- [AUDIT FIX C1] إزالة الأسرار المضمّنة من إعدادات الأتمتة
-- سياق التدقيق: المايجريشن 051 أدخل توكن بوت تليجرام حقيقي + chat_id + webhook secret
-- داخل عمود config، وهذه القيم كانت تُعاد في استجابات API عبر getAutomations()
-- وتتسرب لأي مستخدم مخوّل بعرض الأتمتة. المحرك وقت التشغيل يقرأ بيانات الاعتماد
-- من متغيرات البيئة فقط (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)، لذا إزالتها من
-- قاعدة البيانات لا تكسر أي مسار تنفيذ.

-- 1) إزالة مفاتيح الأسرار من كل صفوف الأتمتة (تُترك مفاتيح التهيئة غير السرية مثل model / severity_threshold)
UPDATE automations
SET config = config - 'bot_token' - 'secret_token',
    updated_at = NOW()
WHERE config ? 'bot_token'
   OR config ? 'secret_token';

-- 2) ضمان عدم إعادة إدخال الأسرار مستقبلاً: قيد فحص يمنع تخزين توكن بأي شكل
ALTER TABLE automations
  DROP CONSTRAINT IF EXISTS automations_no_embedded_bot_token;
ALTER TABLE automations
  ADD CONSTRAINT automations_no_embedded_bot_token
  CHECK (NOT (config ? 'bot_token') AND NOT (config ? 'secret_token'));
