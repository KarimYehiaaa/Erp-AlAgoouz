import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';
import { authenticate } from '../middleware/auth.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { isTrustedWebOrigin } from '../utils/trustedOrigin.ts';
import { query } from '../database/pool.ts';

const clients = new Set<import('ws').WebSocket>();
const sessions = new WeakMap<
  import('ws').WebSocket,
  {
    expiresAt: number;
    role: string;
    version: number;
    generation: string;
    issuedAt: number;
  }
>();

const closeSession = (ws: import('ws').WebSocket) => {
  clients.delete(ws);
  try {
    ws.close(4001, 'Session expired or revoked');
  } catch {
    ws.terminate();
  }
};

// Read current account state without the HTTP authentication cache before sending data.
const validateSessions = async (snapshot: import('ws').WebSocket[]) => {
  if (!snapshot.length) return;
  try {
    const ids = [...new Set(snapshot.map((ws) => Number(ws.userId)))];
    const result = await query(
      `SELECT u.id, u.token_version, u.session_generation, u.password_changed_at, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ANY($1::int[]) AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [ids],
    );
    const users = new Map(result.rows.map((user) => [Number(user.id), user]));
    for (const ws of snapshot) {
      const session = sessions.get(ws);
      const user = users.get(Number(ws.userId));
      const changedAt = user?.password_changed_at
        ? Math.floor(new Date(user.password_changed_at).getTime() / 1000)
        : 0;
      if (
        !session ||
        !user ||
        session.expiresAt <= Date.now() ||
        session.version !== Number(user.token_version ?? 0) ||
        session.generation !== user.session_generation ||
        session.issuedAt < changedAt - 15
      ) {
        closeSession(ws);
      } else {
        session.role = user.role_name;
      }
    }
  } catch {
    // A failed account check must not leave a connection authorized to receive data.
    snapshot.forEach(closeSession);
  }
};

let broadcastQueue: Promise<void> = Promise.resolve();

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
 * @returns {WebSocketServer | undefined}
 */
export const initWebSocket = (server: import('http').Server) => {
  if (process.env.VERCEL) return;
  // مسار مخصص /ws لتفادي تعارض ترقيات الاتصال مع Vite HMR ووكلاء التطوير
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      // التحقق من Origin لمنع Cross-Site WebSocket Hijacking
      const origin = req.headers.origin;
      if (origin && !isTrustedWebOrigin(origin)) {
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
      if (!Number.isFinite(decoded.exp) || decoded.typ || typeof decoded.gen !== 'string') {
        throw new Error('Invalid session token');
      }
      const authRequest: any = { headers: req.headers, cookies: { access_token: token } };
      let authError: unknown;
      await authenticate(authRequest, {} as any, (error?: unknown) => {
        authError = error;
      });
      if (authError || !authRequest.user || ws.readyState !== 1)
        throw new Error('Inactive session');
      ws.userId = authRequest.user.id;
      sessions.set(ws, {
        expiresAt: decoded.exp! * 1000,
        role: authRequest.user.role_name,
        version: Number(decoded.ver ?? 0),
        generation: decoded.gen,
        issuedAt: Number(decoded.iat ?? 0),
      });
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
  let checkingHeartbeat = false;
  const interval = setInterval(async () => {
    if (checkingHeartbeat) return;
    checkingHeartbeat = true;
    try {
      await validateSessions([...clients]);
      for (const ws of clients) {
        if (ws.readyState !== 1 || !ws.isAlive) {
          clients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    } catch {
      [...clients].forEach(closeSession);
    } finally {
      checkingHeartbeat = false;
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
  return wss;
};

/**
 * بث حدث لحظي لكل العملاء المتصلين.
 * @param {string} event اسم الحدث
 * @param {Record<string, any>} [data] بيانات الحدث
 * @returns {void}
 */
export const broadcast = (event: string, data: Record<string, any> = {}): Promise<void> => {
  // Expense events invalidate client caches; business rows remain behind HTTP permissions.
  const eventData = event === 'expenses_changed' ? {} : data;
  const payload = JSON.stringify({ event, data: eventData, timestamp: new Date().toISOString() });
  const recipients = [...clients];
  const requesterId = Number(data.requester_user_id);
  broadcastQueue = broadcastQueue
    .then(async () => {
      await validateSessions(recipients);
      for (const client of recipients) {
        if (!clients.has(client)) continue;
        const session = sessions.get(client);
        if (!session || session.expiresAt <= Date.now()) {
          closeSession(client);
          continue;
        }
        if (
          event === 'approval:requested' &&
          !(ADMIN_ROLES as readonly string[]).includes(session.role)
        )
          continue;
        if (event === 'approval:decided' && Number(client.userId) !== requesterId) continue;
        if (client.readyState === 1 /* OPEN */) {
          try {
            client.send(payload);
          } catch {
            clients.delete(client);
          }
        }
      }
    })
    .catch(() => {
      recipients.forEach(closeSession);
    });
  return broadcastQueue;
};
