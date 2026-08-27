import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import config from '../src/config/index.ts';
import { authenticate, authorize } from '../src/middleware/auth.ts';

const makeRes = () => ({ status: () => makeRes(), json: () => makeRes() }) as any;

describe('authenticate middleware', () => {
  it('rejects requests without any token', async () => {
    let err: any;
    await authenticate({ cookies: {}, headers: {} } as any, makeRes(), (e?: any) => {
      if (e) err = e;
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed bearer tokens with INVALID_TOKEN', async () => {
    let err: any;
    await authenticate(
      { cookies: {}, headers: { authorization: 'Bearer not-a-jwt' } } as any,
      makeRes(),
      (e?: any) => {
        if (e) err = e;
      },
    );
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens signed with the wrong secret', async () => {
    const forged = jwt.sign({ userId: 1 }, 'wrong-secret', { algorithm: 'HS256' });
    let err: any;
    await authenticate(
      { cookies: { access_token: forged }, headers: {} } as any,
      makeRes(),
      (e?: any) => {
        if (e) err = e;
      },
    );
    expect(err.code).toBe('INVALID_TOKEN');
  });
});

describe('authorize middleware', () => {
  it('lets admin roles through without a permission lookup', async () => {
    const req: any = { user: { role_name: 'admin', role_id: 1 } };
    let nextCalled = false;
    const handler = authorize('users.delete' as never);
    await handler(req, makeRes(), () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it('blocks users without a role id', async () => {
    let err: any;
    const handler = authorize('products.view' as never);
    await handler({ user: { role_name: 'ghost' } } as any, makeRes(), (e?: any) => {
      if (e) err = e;
    });
    expect(err.statusCode).toBe(401);
  });
});

describe('jwt configuration sanity', () => {
  it('signs and verifies access tokens with pinned HS256', () => {
    const token = jwt.sign({ userId: 42, ver: 0 }, config.jwt.secret, {
      expiresIn: '2h',
      algorithm: 'HS256',
    });
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(decoded.userId).toBe(42);
  });
});
