import { logger } from '../services/loggerService.ts';
/**
 * utils/dbRetry.ts — إعادة المحاولة التلقائية عند تعارض العمليات (Deadlock / Serialization)
 * يلتقط أخطاء PostgreSQL الشهيرة بالتعارض المؤقت:
 *  - 40P01: Deadlock detected
 *  - 40001: Serialization failure
 * ويعيد تنفيذ الدالة بعد فترة انتظار أسيّة متغيرة (Exponential Backoff with Jitter).
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

const RETRYABLE_PG_CODES = new Set(['40P01', '40001', '53300', '08006', '08001']);

/**
 * تنفيذ عملية قاعدة بيانات مع إعادة المحاولة التلقائية
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 100;
  const maxDelay = options.maxDelayMs ?? 1500;

  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (err: any) {
      attempt++;
      const isRetryable = err?.code && RETRYABLE_PG_CODES.has(err.code);

      if (!isRetryable || attempt > maxRetries) {
        throw err;
      }

      // حساب التأخير الأسي مع عشوائية لتفادي تزامن إعادة المحاولات
      const exponentialDelay = initialDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 50;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      logger.warn(
        `[DbRetry] تعارض مؤقت في قاعدة البيانات (${err.code}). المحاولة ${attempt}/${maxRetries} بعد ${Math.round(delay)}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
