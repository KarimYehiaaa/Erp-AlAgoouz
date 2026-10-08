import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import {
  localProductionContentSecurityPolicy,
  productionContentSecurityPolicyHeader,
} from '../src/utils/contentSecurityPolicy.ts';
import { createCspMetaPlugin } from '../../frontend/src/security/cspMetaPolicy.js';

const configurations = [
  ['API Vercel project', new URL('../../vercel.json', import.meta.url)],
  ['frontend Vercel project', new URL('../../frontend/vercel.json', import.meta.url)],
] as const;

const requiredHeaders = new Map([
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'SAMEORIGIN'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
]);

it.each(configurations)('%s applies baseline browser security headers', async (_name, url) => {
  const config = JSON.parse(await readFile(url, 'utf8')) as {
    headers?: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
  };
  const rule = config.headers?.find((entry) => entry.source === '/(.*)');
  const actual = new Map(rule?.headers.map(({ key, value }) => [key.toLowerCase(), value]));

  for (const [name, value] of requiredHeaders) {
    expect(actual.get(name), `${_name} must set ${name}`).toBe(value);
  }
});

it('keeps the web and Capacitor CSP aligned with both Vercel projects', async () => {
  const configs = await Promise.all(
    configurations.map(async ([, url]) => JSON.parse(await readFile(url, 'utf8'))),
  );
  const policies = configs.map((config) =>
    config.headers
      ?.find((entry: { source: string }) => entry.source === '/(.*)')
      ?.headers.find(
        (header: { key: string }) => header.key.toLowerCase() === 'content-security-policy',
      )
      ?.value.split(';')
      .map((directive: string) => directive.trim())
      .filter(Boolean),
  );
  expect(policies[0]).toEqual(policies[1]);
  expect([...policies[0]!].sort()).toEqual(
    productionContentSecurityPolicyHeader.split('; ').sort(),
  );
  const policy = new Map(
    policies[0]?.map((directive: string) => {
      const [name, ...sources] = directive.split(/\s+/);
      return [name, sources.join(' ')];
    }),
  );
  expect(policy.get('script-src')).toBe("'self'");
  expect(policy.get('object-src')).toBe("'none'");
  expect(policy.get('frame-ancestors')).toBe("'self'");
  expect(policy.get('style-src')).toContain('https://fonts.googleapis.com');
  expect(policy.get('img-src')).toContain('https://images.unsplash.com');
  expect(policy.get('font-src')).toContain('https://fonts.gstatic.com');
  expect(policy.get('connect-src')).not.toContain('http:');
  expect(policy.get('connect-src')).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
  expect(policy.get('connect-src')).not.toMatch(/(?:^|\s)wss:(?:\s|$)/);
  expect(policy.get('connect-src')).not.toMatch(/(?:^|\s)ws:(?:\s|$)/);
  expect(policy.get('connect-src')).toContain('https://agoouz-api.vercel.app');
  expect(policy.get('connect-src')).toContain('wss://agoouz-api.vercel.app');
  expect(policy.get('connect-src')).toContain('wss://agoouz.vercel.app');
  expect(policy.get('script-src')).not.toContain('unsafe-eval');

  const html = await readFile(new URL('../../frontend/index.html', import.meta.url), 'utf8');
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  expect(
    meta,
    'The build must inject a target-specific CSP into the HTML meta policy',
  ).not.toBeNull();
  expect(meta?.[1]).toBe('__ERP_CSP_META__');
  expect(localProductionContentSecurityPolicy.connectSrc).toContain('ws:');
  expect(localProductionContentSecurityPolicy.connectSrc).not.toContain('https:');
  expect(html).toContain('<script src="/theme-init.js"></script>');
  expect(html).not.toMatch(/<script\s*>[\s\S]*?<\/script>/i);
});

it('keeps the self-hosted web meta policy aligned with the backend CSP', async () => {
  const frontendConfig = JSON.parse(
    await readFile(new URL('../../frontend/vercel.json', import.meta.url), 'utf8'),
  );
  const hostedPolicy = frontendConfig.headers
    .find((rule: { source: string }) => rule.source === '/(.*)')
    .headers.find(
      (header: { key: string }) => header.key.toLowerCase() === 'content-security-policy',
    ).value;
  const html = createCspMetaPlugin('shop', hostedPolicy).transformIndexHtml(
    '<meta http-equiv="Content-Security-Policy" content="__ERP_CSP_META__">',
  );
  const actual = html.match(/content="([^"]+)"/)?.[1];
  const toDirectives = (directives: Iterable<string>) =>
    [...directives]
      .map((directive) => {
        const [name, ...sources] = directive.trim().split(/\s+/);
        return `${name} ${sources.sort().join(' ')}`;
      })
      .sort();
  const expected = Object.entries(localProductionContentSecurityPolicy)
    .filter(([name]) => name !== 'frameAncestors')
    .map(
      ([name, sources]) =>
        `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} ${sources.join(' ')}`,
    );

  expect(actual).toBeDefined();
  expect(toDirectives(actual!.split(';'))).toEqual(toDirectives(expected));
});
