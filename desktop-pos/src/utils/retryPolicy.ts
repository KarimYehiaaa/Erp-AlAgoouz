/**
 * utils/retryPolicy.ts — سياسة إعادة المحاولة الذكية للشبكة والتزامن
 * تطبق خوارزمية Exponential Backoff مع Full Jitter لتشتيت الضغط
 * ومنع ظاهرة التزاحم (Thundering Herd) عند عودة الاتصال السحابي.
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatus?: (status: number) => boolean;
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const baseDelay = options.baseDelayMs ?? 800;
  const maxDelay = options.maxDelayMs ?? 15000;

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;

      const status = error?.status || error?.response?.status;

      // أخطاء العميل 4xx (باستثناء 408 Timeout و 429 Too Many Requests) لا نعيد محاولتها
      const isClientError = status >= 400 && status < 500 && status !== 408 && status !== 429;

      if (attempt > maxRetries || isClientError) {
        throw error;
      }

      // حساب التأخير التضاعفي مع العشوائية (Full Jitter)
      const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
      const jitterDelay = Math.random() * exponential + 200;

      console.warn(
        `[Sync Retry] Attempt ${attempt}/${maxRetries} failed. Retrying in ${Math.round(jitterDelay)}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }
}
