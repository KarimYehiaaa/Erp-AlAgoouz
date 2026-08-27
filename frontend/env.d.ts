/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** العنوان الأساسي للـ API (فارغ في التطوير — نفس الأصل عبر بروكسي Vite) */
  readonly VITE_API_URL?: string;
  /** مفتاح Sentry للمراقبة (اختياري) */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
