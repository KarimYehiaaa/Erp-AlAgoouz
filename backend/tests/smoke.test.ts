import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { resolveFrontendDist } from '../src/utils/frontendDist.ts';

/**
 * اختبارات دخان للتأكد من أن البنية الأساسية تعمل فعليًا:
 *  1) body-parser/iconv-lite يقرءان طلبات JSON حقيقية (كانت تنهار بـ
 *     "Cannot find module '../encodings'" عند تلف node_modules).
 *  2) اختيار مجلد الواجهة المبنية يتجاهل مجلدات dist المزيفة (بدون index.html)
 *     ويقدّم من frontend/dist الحقيقي.
 */
describe('smoke: body-parser يعالج POST حقيقي', () => {
  it('يستقبل جسم JSON ويحلله عبر express.json()', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (req, res) => {
      res.json({ received: req.body });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world', n: 42 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ received: { hello: 'world', n: 42 } });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('smoke: اختيار مجلد الواجهة المبنية (dist)', () => {
  it('يختار frontend/dist الحقيقي ويتجاهل مجلد dist مزيفًا بدون index.html في موضع cwd/dist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-smoke-'));
    try {
      // مجلد مزيف في موضع cwd/dist (مثل backend/dist بقايا tsc) — بلا index.html
      mkdirSync(path.join(root, 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'dist', 'tsconfig.tsbuildinfo'), 'junk');

      // الواجهة المبنية الحقيقية مع index.html
      const realDist = path.join(root, 'frontend/dist');
      mkdirSync(realDist, { recursive: true });
      writeFileSync(path.join(realDist, 'index.html'), '<!DOCTYPE html><html></html>');

      const result = resolveFrontendDist(root);
      expect(result).toBe(realDist);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('لا يلتقط أبدًا مجلدًا بدون index.html (يسقط على dist حقيقي أو null)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-smoke-'));
    try {
      const junk = path.join(root, 'dist');
      mkdirSync(junk, { recursive: true }); // مزيف فقط بدون index.html
      const result = resolveFrontendDist(root);
      // يجب ألا يُختار المجلد المزيف أبدًا مهما كان موقعه في سلسلة المرشحين
      expect(result).not.toBe(junk);
      // إن وُجد dist حقيقي (عبر مسارات __dirname للمشروع) فيجب أن يكون frontend/dist يحتوي index.html
      if (result) expect(result).toMatch(/frontend[\\/]dist$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
