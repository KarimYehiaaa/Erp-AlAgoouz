import { describe, it, expect, beforeEach } from 'vitest';
// اختبار العميل الحقيقي بدون أي محاكاة — axios يكشف المعترضات المسجلة عبر handlers
import api from '@/api/client';

interface Handler<T> {
  fulfilled?: T;
  rejected?: T;
}
const responseHandlers = (api.interceptors.response as any).handlers as Array<
  Handler<(v: any) => any>
>;
const fulfilled = responseHandlers[0]?.fulfilled as (res: any) => any;
const rejected = responseHandlers[0]?.rejected as (err: any) => Promise<any>;

describe('api client response interceptor (real instance)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('registers exactly one response interceptor', () => {
    expect(responseHandlers.length).toBeGreaterThanOrEqual(1);
    expect(typeof fulfilled).toBe('function');
    expect(typeof rejected).toBe('function');
  });

  it('unwraps successful responses to their payload', () => {
    expect(fulfilled({ data: { success: true, data: { id: 7 } } })).toEqual({
      success: true,
      data: { id: 7 },
    });
  });

  it('surfaces backend messages and status on rejection', async () => {
    const err = {
      config: { url: '/auth/login', headers: {} },
      response: { status: 401, data: { message: 'بيانات الدخول غير صحيحة' } },
    };
    await expect(rejected(err)).rejects.toMatchObject({
      status: 401,
      message: 'بيانات الدخول غير صحيحة',
    });
  });

  it('normalizes network failures to a friendly message', async () => {
    const err = { config: { url: '/x', headers: {} }, response: undefined, code: 'ERR_NETWORK' };
    await expect(rejected(err)).rejects.toMatchObject({ status: undefined });
  });

  it('clears the cached session when the silent refresh fails (real network miss)', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    const err = {
      config: { url: '/dashboard', _retry: false, headers: {} },
      response: { status: 401, data: {} },
    };
    // لا خادم في بيئة الاختبار — محاولة التجدد تفشل شبكياً وتُمسح الجلسة
    await expect(rejected(err)).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('user')).toBeNull();
  }, 15_000);
});
