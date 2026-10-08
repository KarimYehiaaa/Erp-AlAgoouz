import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';
import { chromium } from '@playwright/test';

test('receipt text stays inert and browser printing works under both web CSP policies', async () => {
  const sourcePath = fileURLToPath(
    new URL('../../frontend/src/services/directPrinter.ts', import.meta.url),
  );
  const bundle = await transformWithEsbuild(readFileSync(sourcePath, 'utf8'), sourcePath, {
    loader: 'ts',
    format: 'iife',
    globalName: 'ReceiptPrinter',
    sourcemap: false,
  });
  const policies = [
    null,
    ...['../../vercel.json', '../../frontend/vercel.json'].map(
      (file) =>
        JSON.parse(readFileSync(new URL(file, import.meta.url))).headers[0].headers.find(
          (h) => h.key === 'Content-Security-Policy',
        ).value,
    ),
  ];
  let policy;
  let attackRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/receipt.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(bundle.code);
    } else if (request.url === '/attack') {
      attackRequests++;
      response.end('unexpected receipt resource');
    } else {
      if (policy) response.setHeader('Content-Security-Policy', policy);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html><body><script src="/receipt.js"></script></body></html>');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    for (policy of policies) {
      const page = await browser.newPage();
      try {
        await page.addInitScript(() => {
          new globalThis.MutationObserver((records) => {
            for (const record of records)
              for (const node of record.addedNodes) {
                if (node instanceof globalThis.HTMLIFrameElement) {
                  node.contentWindow.print = () => {
                    globalThis.__receiptPrinted = {
                      text: node.contentDocument.body.textContent,
                      title: node.contentDocument.title,
                      executableElements:
                        node.contentDocument.querySelectorAll('script,img,svg,iframe').length,
                    };
                  };
                }
              }
          }).observe(globalThis.document, { childList: true, subtree: true });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const payload =
          '</title><script>parent.__receiptInjected=true</script><img src="/attack"> بن & "العجوز"';
        await page.evaluate(
          (payload) =>
            globalThis.ReceiptPrinter.printReceiptHtml({
              invoice_number: payload,
              user_name: payload,
              customer_name: payload,
              created_at: '2026-10-07T10:00:00Z',
              total_amount: 10,
              company: { name_ar: payload, tagline: payload, address: payload, phone: payload },
              items: [
                {
                  product_name: payload,
                  notes: payload,
                  quantity: 1,
                  unit_price: 10,
                  total_amount: 10,
                },
              ],
              payments: [{ method: payload, amount: 10 }],
              loyalty: { earned: payload, redeemed: payload },
            }),
          payload,
        );
        await page.waitForFunction(() => Boolean(globalThis.__receiptPrinted));
        const result = await page.evaluate(() => ({
          printed: globalThis.__receiptPrinted,
          injected: Boolean(globalThis.__receiptInjected),
        }));
        assert.equal(result.injected, false, 'receipt data executed code in the parent page');
        assert.equal(
          result.printed.executableElements,
          0,
          'receipt data introduced executable/resource markup',
        );
        assert.ok(
          result.printed.text.includes(payload),
          'receipt text was lost or interpreted as HTML',
        );
        assert.equal(result.printed.title, `إيصال ${payload}`);
        assert.equal(attackRequests, 0, 'receipt text triggered a resource request');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
