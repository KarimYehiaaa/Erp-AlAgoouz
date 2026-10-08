/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** العنوان الأساسي للـ API (فارغ في التطوير — نفس الأصل عبر بروكسي Vite) */
  readonly VITE_API_URL?: string;
  /** أصول HTTPS إضافية موثوقة وقت البناء، مفصولة بفواصل وتتضمن المنفذ. */
  readonly VITE_TRUSTED_SERVER_URLS?: string;
  /** مفتاح Sentry للمراقبة (اختياري) */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
