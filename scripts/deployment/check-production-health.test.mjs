import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealthResponse, checkProduction } from './check-production-health.mjs';

test('rejects an HTML fallback even with HTTP 200', async () => {
  await assert.rejects(
    checkHealthResponse(
      new Response('<!DOCTYPE html>', {
        headers: { 'content-type': 'text/html' },
      }),
    ),
    /did not return JSON/,
  );
});

test('rejects disconnected databases and malformed health responses', async () => {
  for (const body of [
    { success: true, db: { connected: false } },
    {},
    { success: 'true', db: { connected: true } },
  ]) {
    await assert.rejects(checkHealthResponse(Response.json(body)), /not healthy/);
  }
  await assert.rejects(checkHealthResponse(Response.json({}, { status: 503 })), /HTTP 503/);
});

test('checks direct API, frontend proxy and web separately', async () => {
  const calls = [];
  const checks = await checkProduction({
    fetchImpl: async (url) => {
      calls.push(url.href);
      return url.pathname === '/'
        ? new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } })
        : Response.json({ success: true, db: { connected: true } });
    },
  });
  assert.equal(checks.length, 3);
  assert.ok(calls.includes('https://agoouz-api.vercel.app/health'));
  assert.ok(calls.includes('https://agoouz.vercel.app/api/v1/health'));
});

test('fails if only the frontend proxy is broken', async () => {
  await assert.rejects(
    checkProduction({
      fetchImpl: async (url) => {
        if (url.pathname === '/api/v1/health') throw new Error('proxy unavailable');
        return url.pathname === '/'
          ? new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } })
          : Response.json({ success: true, db: { connected: true } });
      },
    }),
    /Frontend API proxy and database: proxy unavailable/,
  );
});
