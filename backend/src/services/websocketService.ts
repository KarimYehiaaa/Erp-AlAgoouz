import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';

const clients = new Set<import('ws').WebSocket>();

/**
 * تفعيل WebSocket للمزامنة اللحظية (مصادقة بالتوكن).
 * @param {import('http').Server} server خادم HTTP
 * @returns {void}
 */
export const initWebSocket = (server: import('http').Server) => {
  if (process.env.VERCEL) return;
  // مسار مخصص /ws لتفادي تعارض ترقيات الاتصال مع Vite HMR ووكلاء التطوير
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // التحقق من Origin لمنع Cross-Site WebSocket Hijacking
      const origin = req.headers.origin;
      if (origin && !config.corsOrigin.includes(origin) && !config.isDevelopment) {
        ws.close(4003, 'Forbidden: Origin not allowed');
        return;
      }

      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Unauthorized: No token provided');
        return;
      }

      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
      }) as import('jsonwebtoken').JwtPayload;
      ws.userId = decoded.userId;
      clients.add(ws);
    } catch {
      ws.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    // Heartbeat to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Ping interval to clean up stale connections
  const interval = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
};

/**
 * بث حدث لحظي لكل العملاء المتصلين.
 * @param {string} event اسم الحدث
 * @param {Record<string, any>} [data] بيانات الحدث
 * @returns {void}
 */
export const broadcast = (event: string, data: Record<string, any> = {}) => {
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
};
