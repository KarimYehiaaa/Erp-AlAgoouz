import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('child_process', () => ({ execFile: native.execute }));
vi.mock('../src/database/pool.ts', () => ({
  query: vi.fn(async () => ({ rows: [{ key: 'company', value: { name_ar: 'بن العجوز' } }] })),
}));
import { generateQuotePdf } from '../src/services/quotePdfService.ts';

const payload = { customer_name: 'عميل اختبار', items: [{ product_name: 'بن', unit_price: 100 }] };
const validPdf = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
const ownedDirectories: string[] = [];

beforeEach(() => {
  vi.stubEnv('CHROME_PATH', process.execPath);
  native.execute.mockReset();
  native.execute.mockImplementation((_binary, args, _options, callback) => {
    const pdfPath = args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15);
    fs.writeFile(pdfPath, validPdf).then(() => callback(null, '', ''), callback);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const directory of ownedDirectories.splice(0)) {
    expect(path.dirname(directory)).toBe(os.tmpdir());
    expect(path.basename(directory)).toMatch(/^quote-pdf-/);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('uses a private browser profile per request without disabling its sandbox', async () => {
  const result = await generateQuotePdf(payload);
  const [, args] = native.execute.mock.calls[0];
  const profileArgument = args.find((arg: string) => arg.startsWith('--user-data-dir='));
  expect(profileArgument).toBeDefined();
  const profile = profileArgument.slice('--user-data-dir='.length);
  const documentPath = new URL(args.at(-1));
  expect(path.dirname(profile)).toBe(path.dirname(fileURLToPath(documentPath)));
  expect(args).not.toContain('--no-sandbox');
  expect(args).toContain('--no-pdf-header-footer');
  expect(result.buffer).toEqual(validPdf);
  await expect(fs.access(path.dirname(profile))).rejects.toThrow();
});

it('resolves a configured browser command on PATH instead of a hidden installed browser', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quote-pdf-fixture-'));
  ownedDirectories.push(directory);
  const command = process.platform === 'win32' ? 'fixture-chrome.exe' : 'fixture-chrome';
  const binary = path.join(directory, command);
  await fs.writeFile(binary, 'fixture');
  vi.stubEnv('PATH', directory);
  vi.stubEnv('CHROME_PATH', command);
  await generateQuotePdf(payload);
  expect(native.execute.mock.calls[0][0]).toBe(binary);
});

it('discovers a standard browser on PATH when no explicit path is set', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quote-pdf-fixture-'));
  ownedDirectories.push(directory);
  const command = process.platform === 'win32' ? 'chrome.exe' : 'chromium';
  const binary = path.join(directory, command);
  await fs.writeFile(binary, 'fixture');
  vi.stubEnv('PATH', directory);
  vi.stubEnv('CHROME_PATH', '');
  await generateQuotePdf(payload);
  expect(native.execute.mock.calls[0][0]).toBe(binary);
});

it.each([path.join(os.tmpdir(), 'quote-pdf-no-such-browser', 'browser'), os.tmpdir()])(
  'does not silently replace an invalid explicit browser path: %s',
  async (configured) => {
    vi.stubEnv('CHROME_PATH', configured);
    await expect(generateQuotePdf(payload)).rejects.toThrow(/CHROME_PATH/);
    expect(native.execute).not.toHaveBeenCalled();
  },
);

it('removes its directory if writing the input document fails before the browser starts', async () => {
  const originalMkdtemp = fs.mkdtemp.bind(fs);
  let directory = '';
  vi.spyOn(fs, 'mkdtemp').mockImplementation(async (prefix) => {
    directory = await originalMkdtemp(prefix);
    ownedDirectories.push(directory);
    return directory;
  });
  vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('fixture input write failed'));
  await expect(generateQuotePdf(payload)).rejects.toThrow('fixture input write failed');
  expect(native.execute).not.toHaveBeenCalled();
  await expect(fs.access(directory)).rejects.toThrow();
});

it('removes its directory when the native browser fails', async () => {
  let directory = '';
  native.execute.mockImplementation((_binary, args, _options, callback) => {
    directory = path.dirname(
      args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15),
    );
    callback(new Error('fixture browser failed'));
  });
  await expect(generateQuotePdf(payload)).rejects.toThrow('fixture browser failed');
  await expect(fs.access(directory)).rejects.toThrow();
});

it.each(['not a PDF', '%PDF-1.7\nunfinished', '', 'invalid\n%%EOF'])(
  'rejects corrupt or incomplete PDF output: %s',
  async (output) => {
    native.execute.mockImplementation((_binary, args, _options, callback) => {
      const pdfPath = args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15);
      fs.writeFile(pdfPath, output).then(() => callback(null, '', ''), callback);
    });
    await expect(generateQuotePdf(payload)).rejects.toThrow(/PDF/);
  },
);

it('escapes customer input and prevents script and network access in the rendered document', async () => {
  let html = '';
  native.execute.mockImplementation((_binary, args, _options, callback) => {
    const render = async () => {
      html = await fs.readFile(fileURLToPath(args.at(-1)), 'utf8');
      const pdfPath = args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15);
      await fs.writeFile(pdfPath, validPdf);
    };
    void render().then(() => callback(null, '', ''), callback);
  });
  await generateQuotePdf({
    ...payload,
    customer_name: '<script>fetch("https://untrusted.invalid")</script>',
  });
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain("default-src 'none'");
  expect(html).toContain('img-src data:');
});

it('uses the project logo when launched from a directory containing another application logo', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quote-pdf-fixture-'));
  ownedDirectories.push(directory);
  await fs.mkdir(path.join(directory, 'assets'));
  const foreignLogo = Buffer.from('unrelated application logo fixture');
  await fs.writeFile(path.join(directory, 'assets/logo.png'), foreignLogo);
  let usesForeignLogo = false;
  let usesProjectLogo = false;
  const projectLogo = await fs.readFile(new URL('../../assets/logo.png', import.meta.url));
  native.execute.mockImplementation((_binary, args, _options, callback) => {
    const render = async () => {
      const html = await fs.readFile(fileURLToPath(args.at(-1)), 'utf8');
      usesForeignLogo = html.includes(foreignLogo.toString('base64'));
      usesProjectLogo = html.includes(projectLogo.toString('base64'));
      const pdfPath = args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15);
      await fs.writeFile(pdfPath, validPdf);
    };
    void render().then(() => callback(null, '', ''), callback);
  });
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  try {
    await generateQuotePdf(payload);
  } finally {
    cwd.mockRestore();
  }
  expect(usesForeignLogo).toBe(false);
  expect(usesProjectLogo).toBe(true);
});

it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'uses the Cairo issue day and 15-day calendar validity on a host in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    let html = '';
    native.execute.mockImplementation((_binary, args, _options, callback) => {
      const render = async () => {
        html = await fs.readFile(fileURLToPath(args.at(-1)), 'utf8');
        const pdfPath = args.find((arg: string) => arg.startsWith('--print-to-pdf=')).slice(15);
        await fs.writeFile(pdfPath, validPdf);
      };
      void render().then(() => callback(null, '', ''), callback);
    });
    const result = await generateQuotePdf({ ...payload, issued_at: '2026-10-04T22:30:00Z' });
    expect(result.quoteNumber).toMatch(/^QUO-20261005-\d{4}$/);
    const cairoDates = new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(html.includes(cairoDates.format(new Date('2026-10-05T00:00:00Z')))).toBe(true);
    expect(html.includes(cairoDates.format(new Date('2026-10-20T00:00:00Z')))).toBe(true);
  },
);

it('keeps concurrent requests in distinct browser profiles and cleans both', async () => {
  await Promise.all([generateQuotePdf(payload), generateQuotePdf(payload)]);
  const profiles = native.execute.mock.calls.map(([, args]) =>
    args.find((arg: string) => arg.startsWith('--user-data-dir=')),
  );
  expect(profiles[0]).toBeDefined();
  expect(profiles[1]).toBeDefined();
  expect(profiles[0]).not.toBe(profiles[1]);
  for (const profile of profiles)
    await expect(fs.access(profile.slice('--user-data-dir='.length))).rejects.toThrow();
});
