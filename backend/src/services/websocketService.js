import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

const clients = new Set();

export const initWebSocket = (server) => {
  if (process.env.VERCEL) return;
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        ws.close(4001, 'Unauthorized: No token provided');
        return;
      }
      
      const decoded = jwt.verify(token, config.jwt.secret);
      ws.userId = decoded.userId;
      clients.add(ws);
    } catch (err) {
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

export const broadcast = (event, data = {}) => {
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(payload);
      } catch (err) {
        clients.delete(client);
      }
    }
  }
};
