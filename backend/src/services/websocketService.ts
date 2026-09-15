import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';

const clients = new Set<import('ws').WebSocket>();

/**
 * قراءة قيمة كوكي محددة من ترويسة Cookie للطلب.
 * @param {import('http').IncomingMessage} req طلب الترقية
 * @param {string} name اسم الكوكي
 * @returns {string | null}
 */
const getCookie = (req: import('http').IncomingMessage, name: string): string | null => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
};

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
      // التحقق من Origin لمنع Cross-Site WebSocket Hijacking
      // https://localhost هو أصل تطبيق الموبايل (Capacitor WebView)
      const origin = req.headers.origin;
      if (
        origin &&
        !config.corsOrigin.includes(origin) &&
        origin !== 'https://localhost' &&
        !config.isDevelopment
      ) {
        ws.close(4003, 'Forbidden: Origin not allowed');
        return;
      }

      // المصادقة عبر HttpOnly cookie المرفق تلقائياً مع ترقية الاتصال (نفس الأصل)
      // — لا يُقبل توكن عبر الـ URL لتفادي تسريبه في سجلات الخوادم والبروكسي.
      const token = getCookie(req, 'access_token');

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
