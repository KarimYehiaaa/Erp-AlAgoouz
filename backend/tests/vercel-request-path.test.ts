import { describe, expect, it } from 'vitest';
import { restoreVercelRequestPath } from '../src/utils/vercelRequestPath.ts';

describe('restoreVercelRequestPath', () => {
  it('keeps an unrewritten local request intact', () => {
    const request = { url: '/api/v1/health?full=1', headers: {} };
    restoreVercelRequestPath(request);
    expect(request.url).toBe('/api/v1/health?full=1');
  });

  it('uses the original matched route for a shared function rewrite', () => {
    const request: Parameters<typeof restoreVercelRequestPath>[0] = {
      url: '/api/index',
      headers: { 'x-matched-path': '/api/v1/health?full=1' },
    };
    restoreVercelRequestPath(request);
    expect(request.url).toBe('/api/v1/health?full=1');
    expect(request.originalUrl).toBe(request.url);
  });

  it('restores catch-all routes without turning an empty match into health', () => {
    const request = {
      url: '/sales/41',
      headers: { 'x-matched-path': '/api/v1/[...slug]' },
    };
    restoreVercelRequestPath(request);
    expect(request.url).toBe('/api/v1/sales/41');
    const unresolved = { url: '/api/index', headers: { 'x-matched-path': '/api/index' } };
    restoreVercelRequestPath(unresolved);
    expect(unresolved.url).toBe('/api/index');
  });

  it('decodes dynamic route matches and preserves the selected API prefix', () => {
    const request = {
      url: '/api/index',
      headers: {
        'x-now-route-matches': '1=sales%2Fcoffee%2520beans',
        'x-forwarded-uri': '/api/v1/sales/coffee%20beans',
      },
    };
    restoreVercelRequestPath(request);
    expect(request.url).toBe('/api/v1/sales/coffee%20beans');
  });

  it('accepts array-valued rewrite headers without throwing', () => {
    const request = {
      url: '/api/index',
      headers: { 'x-forwarded-uri': ['/api/health?full=1'] },
    };
    restoreVercelRequestPath(request);
    expect(request.url).toBe('/api/health?full=1');
  });
});
