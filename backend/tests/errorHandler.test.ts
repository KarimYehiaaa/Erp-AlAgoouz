import { describe, it, expect } from 'vitest';
import { errorHandler, notFound } from '../src/middleware/errorHandler.ts';
import { AppError } from '../src/types/errors.ts';

const makeRes = () => {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const makeReq = () => ({ path: '/test', method: 'GET', requestId: 'req-1' }) as any;

describe('central error handler classification', () => {
  it('maps PG duplicate key (23505) to 409 DUPLICATE_KEY', () => {
    const res = makeRes();
    errorHandler(
      Object.assign(new Error('dup'), { code: '23505', detail: 'Key (username)=(x) exists.' }),
      makeReq(),
      res,
      {} as any,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_KEY');
    expect(res.body.success).toBe(false);
  });

  it('maps PG foreign key violation (23503) to 409', () => {
    const res = makeRes();
    errorHandler(Object.assign(new Error('fk'), { code: '23503' }), makeReq(), res, {} as any);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('maps PG query timeout (57014) to 504', () => {
    const res = makeRes();
    errorHandler(Object.assign(new Error('timeout'), { code: '57014' }), makeReq(), res, {} as any);
    expect(res.statusCode).toBe(504);
    expect(res.body.code).toBe('QUERY_TIMEOUT');
  });

  it('maps connection errors to 503 DB_UNAVAILABLE', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', '08006']) {
      const res = makeRes();
      errorHandler(Object.assign(new Error('conn'), { code }), makeReq(), res, {} as any);
      expect(res.statusCode).toBe(503);
      expect(res.body.code).toBe('DB_UNAVAILABLE');
    }
  });

  it('passes AppError message and code through', () => {
    const res = makeRes();
    errorHandler(new AppError('خطأ مخصص', 422, 'CUSTOM_CODE'), makeReq(), res, {} as any);
    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe('خطأ مخصص');
    expect(res.body.code).toBe('CUSTOM_CODE');
  });

  it('hides internals of unexpected 500 errors behind a generic message', () => {
    const res = makeRes();
    errorHandler(new Error('secret internal detail'), makeReq(), res, {} as any);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    // رسالة العميل عامة — التفاصيل الخام لا تظهر إلا في غير الإنتاج عبر rawMessage/stack
    expect(res.body.message).not.toContain('secret internal detail');
  });

  it('attaches the request id to the response', () => {
    const res = makeRes();
    errorHandler(new AppError('x', 400), makeReq(), res, {} as any);
    expect(res.body.requestId).toBe('req-1');
  });
});

describe('notFound handler', () => {
  it('forwards a 404 AppError carrying the original URL', () => {
    let captured: any;
    const next = (e: any) => (captured = e);
    const req: any = { originalUrl: '/api/v1/nope' };
    notFound(req, {} as any, next);
    expect(captured).toBeInstanceOf(AppError);
    expect(captured.statusCode).toBe(404);
    expect(captured.message).toContain('/api/v1/nope');
  });
});
