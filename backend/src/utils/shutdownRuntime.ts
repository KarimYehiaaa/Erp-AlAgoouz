import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';
export const RUNTIME_SHUTDOWN_TIMEOUT_MS = 30000;

export type RuntimeResources = {
  servers: Server[];
  webSockets: WebSocketServer[];
  stopBackground: () => void;
  stopJobs: () => Promise<void>;
  closeDatabase: () => Promise<void>;
};

/** Stop admission immediately, then drain requests/jobs before closing their database. */
export const drainRuntime = async (resources: RuntimeResources) => {
  const errors: unknown[] = [];
  try {
    resources.stopBackground();
  } catch (error) {
    errors.push(error);
  }
  const drains = resources.servers.map(
    (server) =>
      new Promise<void>((resolve, reject) => {
        server.close((error?: Error & { code?: string }) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      }),
  );
  for (const wss of resources.webSockets) {
    drains.push(
      new Promise<void>((resolve, reject) => {
        const forceClose = setTimeout(() => {
          for (const client of wss.clients) client.terminate();
        }, 1000);
        forceClose.unref();
        for (const client of wss.clients) client.close(1001, 'Server shutting down');
        wss.close((error?: Error) => {
          clearTimeout(forceClose);
          if (error) reject(error);
          else resolve();
        });
      }),
    );
  }
  const results = await Promise.allSettled([...drains, resources.stopJobs()]);
  for (const result of results) if (result.status === 'rejected') errors.push(result.reason);
  try {
    await resources.closeDatabase();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, 'Runtime shutdown failed.');
};
