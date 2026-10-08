import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { requestCloudJson } from '../src/utils/cloudProviderRequest.ts';

const servers: http.Server[] = [];
async function fixture(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe('bounded cloud provider HTTP transport (loopback fixtures only)', () => {
  it.each(['headers', 'body'])('aborts a provider stalled at %s', async (stage) => {
    let arrived = false;
    const url = await fixture((_request, response) => {
      arrived = true;
      if (stage === 'body') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.flushHeaders();
        response.write('{"access_token":');
      }
      // Deliberately never finish; the real native fetch must abort its read.
    });
    await expect(
      requestCloudJson(url, { method: 'POST' }, 'fixture operation', AbortSignal.timeout(500)),
    ).rejects.toMatchObject({ statusCode: 504 });
    expect(arrived).toBe(true);
  });

  it('never forwards credentials or data to a redirect destination', async () => {
    let redirectedRequests = 0;
    const url = await fixture((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(307, { Location: '/credential-leak' });
        response.end();
      } else {
        redirectedRequests++;
        response.end('{}');
      }
    });
    await expect(
      requestCloudJson(
        `${url}/redirect`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture-token' },
          body: 'private-fixture-payload',
        },
        'fixture operation',
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(redirectedRequests).toBe(0);
  });

  it('rejects an oversized provider response instead of buffering it without a bound', async () => {
    const url = await fixture((_request, response) => {
      response.end(JSON.stringify({ access_token: 'x'.repeat(100_000) }));
    });
    await expect(requestCloudJson(url, {}, 'fixture operation')).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it.each([200, 403])('sanitizes a non-JSON response with status %s', async (status) => {
    const url = await fixture((_request, response) => {
      response.writeHead(status);
      response.end('<html>private-fixture-provider-secret</html>');
    });
    await expect(requestCloudJson(url, {}, 'fixture operation')).rejects.toMatchObject({
      statusCode: status === 200 ? 502 : 400,
      message: expect.not.stringContaining('private-fixture-provider-secret'),
    });
  });

  it('refuses to send data after the shared operation deadline has already expired', async () => {
    let requests = 0;
    const url = await fixture((_request, response) => {
      requests++;
      response.end('{}');
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestCloudJson(url, { method: 'POST' }, 'fixture operation', controller.signal),
    ).rejects.toMatchObject({ statusCode: 504 });
    expect(requests).toBe(0);
  });

  it('consumes and returns a valid provider receipt', async () => {
    const url = await fixture((_request, response) => response.end('{"id":"fixture-id"}'));
    expect(await requestCloudJson(url, {}, 'fixture operation')).toEqual({ id: 'fixture-id' });
  });
});
