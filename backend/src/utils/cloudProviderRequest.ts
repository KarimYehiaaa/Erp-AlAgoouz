import { AppError } from '../types/errors.ts';

export const CLOUD_BACKUP_TIMEOUT_MS = 30_000;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const quotaMessage =
  'مساحة Google Drive غير كافية. حساب الخدمة لا يملك مساحة خاصة؛ استخدم مجلدًا في Shared Drive متاح لحسابك ومشاركًا مع حساب الخدمة المهيأ، أو فعّل OAuth لحساب مستخدم يملك مساحة.';

/** Bound both headers and response-body consumption; never expose provider content or credentials. */
export async function requestCloudJson(
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]>,
  operation: string,
  signal: AbortSignal = AbortSignal.timeout(CLOUD_BACKUP_TIMEOUT_MS),
  googleDrive = false,
): Promise<Record<string, unknown>> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal, redirect: 'error' });
    reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_PROVIDER_RESPONSE_BYTES) {
          throw new AppError(`${operation}: استجابة المزود أكبر من الحد المسموح`, 502);
        }
        chunks.push(value);
      }
    }
    let data: unknown;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      // HTML/error pages and invalid JSON must not escape through parse errors.
      if (response.ok) throw new AppError(`${operation}: استجابة المزود غير صالحة`, 502);
    }
    if (!response.ok) {
      if (googleDrive && data && typeof data === 'object') {
        const error = (data as { error?: { errors?: Array<{ reason?: unknown }> } }).error;
        if (
          Array.isArray(error?.errors) &&
          error.errors.some((e) => e?.reason === 'storageQuotaExceeded')
        ) {
          throw new AppError(quotaMessage, 403);
        }
      }
      throw new AppError(`${operation}: رفض المزود الطلب (HTTP ${response.status})`, 400);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError(`${operation}: استجابة المزود غير صالحة`, 502);
    }
    return data as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    if (signal.aborted) throw new AppError(`${operation}: انتهت مهلة الاتصال بالمزود`, 504);
    throw new AppError(`${operation}: تعذر الاتصال الآمن بالمزود`, 502);
  } finally {
    // Also releases oversized, rejected and interrupted responses.
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

export function requireProviderString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new AppError('استجابة مزود النسخ السحابي تفتقد رمزًا أو معرّفًا صالحًا', 502);
  }
  return value.trim();
}
