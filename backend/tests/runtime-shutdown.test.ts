import { expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { drainRuntime } from '../src/utils/shutdownRuntime.ts';

it('drains a real admitted HTTP request and background job before closing their database', async () => {
  let arrived!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let releaseRequest!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let releaseJob!: () => void;
  const job = new Promise<void>((resolve) => {
    releaseJob = resolve;
  });
  const events: string[] = [];
  const server = http.createServer(async (_req, res) => {
    arrived();
    await gate;
    events.push('request');
    res.end('completed business request');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = fetch(url).then((result) => result.text());
  const closeDatabase = vi.fn(async () => {
    events.push('database');
  });
  let draining: Promise<void> | undefined;
  try {
    await reached;
    draining = drainRuntime({
      servers: [server],
      webSockets: [],
      stopBackground: () => {
        events.push('stop');
      },
      stopJobs: async () => {
        await job;
        events.push('job');
      },
      closeDatabase,
    });
    expect(server.listening).toBe(false);
    expect(closeDatabase).not.toHaveBeenCalled();
    releaseRequest();
    expect(await response).toBe('completed business request');
    expect(closeDatabase).not.toHaveBeenCalled();
    releaseJob();
    await draining;
    expect(events).toEqual(['stop', 'request', 'job', 'database']);
  } finally {
    releaseRequest();
    releaseJob();
    await draining;
    server.closeAllConnections();
    server.close();
    await response.catch(() => undefined);
  }
});

it('closes an actual WebSocket with a shutdown code before completing resource cleanup', async () => {
  const server = http.createServer((_req, res) => res.end('fixture'));
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}`);
  await once(socket, 'open');
  const closed = once(socket, 'close');
  const closeDatabase = vi.fn().mockResolvedValue(undefined);
  try {
    await drainRuntime({
      servers: [server],
      webSockets: [wss],
      stopBackground: () => {},
      stopJobs: async () => {},
      closeDatabase,
    });
    const [code] = await closed;
    expect(code).toBe(1001);
    expect(closeDatabase).toHaveBeenCalledOnce();
  } finally {
    socket.terminate();
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.closeAllConnections();
    server.close();
  }
});

it('reports a worker shutdown failure after still releasing the other resources', async () => {
  const closeDatabase = vi.fn().mockResolvedValue(undefined);
  await expect(
    drainRuntime({
      servers: [],
      webSockets: [],
      stopBackground: () => {},
      stopJobs: async () => {
        throw new Error('Isolated worker close failure');
      },
      closeDatabase,
    }),
  ).rejects.toThrow('Runtime shutdown failed');
  expect(closeDatabase).toHaveBeenCalledOnce();
});

it('an unresponsive WebSocket peer cannot hold shutdown open indefinitely', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const connected = once(wss, 'connection');
  const peer = net.connect((server.address() as AddressInfo).port, '127.0.0.1');
  await once(peer, 'connect');
  peer.write(
    'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
  );
  const [socket] = await connected;
  // This raw peer receives frames but deliberately never acknowledges a close frame.
  peer.resume();
  const closed = once(socket, 'close');
  const closeDatabase = vi.fn().mockResolvedValue(undefined);
  try {
    await drainRuntime({
      servers: [server],
      webSockets: [wss],
      stopBackground: () => {},
      stopJobs: async () => {},
      closeDatabase,
    });
    expect((await closed)[0]).toBe(1006);
    expect(closeDatabase).toHaveBeenCalledOnce();
  } finally {
    peer.destroy();
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.closeAllConnections();
    server.close();
  }
});
