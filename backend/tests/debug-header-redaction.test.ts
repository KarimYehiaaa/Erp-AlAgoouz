import { describe, expect, it } from 'vitest';
import { pickSafeDebugHeaders } from '../src/utils/debugHeaders.ts';

describe('debug endpoint header filtering', () => {
  it('keeps routing diagnostics and excludes cookies, credentials, and unknown headers', () => {
    expect(
      pickSafeDebugHeaders({
        accept: 'application/json',
        authorization: 'Bearer access-secret',
        cookie: 'access_token=http-only-secret; refresh_token=refresh-secret',
        origin: 'http://localhost:5173',
        'user-agent': 'ERP test client',
        'x-client-type': 'desktop-pos',
        'x-refresh-token': 'refresh-secret',
        'x-api-key': 'api-secret',
      }),
    ).toEqual({
      accept: 'application/json',
      origin: 'http://localhost:5173',
      'user-agent': 'ERP test client',
      'x-client-type': 'desktop-pos',
    });
  });
});
