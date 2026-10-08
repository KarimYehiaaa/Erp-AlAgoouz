import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCspMetaPlugin, getCspMetaPolicy } from './cspMetaPolicy.js';

const rootPackage = JSON.parse(readFileSync(path.resolve('../package.json'), 'utf8'));
const frontendPackage = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
const rootDeploymentConfig = JSON.parse(readFileSync(path.resolve('../vercel.json'), 'utf8'));
const deploymentConfig = JSON.parse(readFileSync(path.resolve('vercel.json'), 'utf8'));
const securityHeaders = (config: {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}) =>
  config.headers
    ?.find((rule) => rule.source === '/(.*)')
    ?.headers.filter(({ key }) =>
      [
        'content-security-policy',
        'x-content-type-options',
        'x-frame-options',
        'referrer-policy',
      ].includes(key.toLowerCase()),
    );
const rootSecurityHeaders = securityHeaders(rootDeploymentConfig);
const hostedSecurityHeaders = securityHeaders(deploymentConfig);
const hostedCsp = hostedSecurityHeaders?.find(
  (header) => header.key.toLowerCase() === 'content-security-policy',
)?.value;

describe('build-target CSP meta policy', () => {
  it('keeps root and frontend Vercel deployments aligned on required web security headers', () => {
    expect(rootSecurityHeaders).toHaveLength(4);
    expect(hostedSecurityHeaders).toHaveLength(4);
    expect(rootSecurityHeaders).toEqual(hostedSecurityHeaders);
  });

  it('keeps production web builds limited to secure hosted API origins', () => {
    const policy = getCspMetaPolicy('production', hostedCsp);

    expect(policy).toContain('https://agoouz-api.vercel.app');
    expect(policy).toContain('wss://agoouz-api.vercel.app');
    expect(policy).not.toMatch(/(?:^|\s)http:(?:\s|$)/);
    expect(policy).not.toMatch(/(?:^|\s)ws:(?:\s|$)/);
    expect(policy).not.toContain('frame-ancestors');
  });

  it('preserves local HTTP and WebSocket access for development builds', () => {
    const policy = getCspMetaPolicy('development', hostedCsp);
    expect(policy).toMatch(/(?:^|\s)http:(?:\s|$)/);
    expect(policy).toMatch(/(?:^|\s)ws:(?:\s|$)/);
    expect(policy).not.toContain('frame-ancestors');
  });

  it('allows secure custom native servers and WebSockets while denying native Release cleartext', () => {
    for (const variant of [undefined, 'Release', 'unknown']) {
      const policy = getCspMetaPolicy('native', hostedCsp, variant);
      const connections = policy
        .split(';')
        .find((directive: string) => directive.trim().startsWith('connect-src'))!;
      expect(connections).toMatch(/(?:^|\s)https:(?:\s|$)/);
      expect(connections).toMatch(/(?:^|\s)wss:(?:\s|$)/);
      expect(connections).not.toMatch(/(?:^|\s)(?:http:|ws:)/);
    }
  });

  it('limits native Debug cleartext to the standard Android emulator gateway', () => {
    const policy = getCspMetaPolicy('native', hostedCsp, 'Debug');
    expect(policy).toContain('http://10.0.2.2:*');
    expect(policy).toContain('ws://10.0.2.2:*');
    expect(policy).not.toContain('192.168.1.14');
    expect(policy).not.toMatch(/(?:^|\s)http:(?:\s|$)/);
    expect(policy).not.toMatch(/(?:^|\s)ws:(?:\s|$)/);
  });

  it('allows only WebSocket for local production builds', () => {
    const policy = getCspMetaPolicy('shop', hostedCsp);
    expect(policy).toMatch(/(?:^|\s)ws:(?:\s|$)/);
    expect(policy).not.toMatch(/(?:^|\s)http:(?:\s|$)/);
  });

  it('routes local, hosted, and native packaging through their matching CSP build modes', () => {
    expect(rootPackage.scripts.build).toBe('npm run build:local -w frontend');
    expect(frontendPackage.scripts.build).toBe('vite build');
    expect(frontendPackage.scripts['build:local']).toBe('vite build --mode shop');
    expect(frontendPackage.scripts['build:mobile']).toBe('vite build --mode native');
    expect(frontendPackage.scripts['cap:build']).toBe('npm run build:mobile && cap sync android');

    for (const file of ['../Dockerfile', '../backend/Dockerfile', 'Dockerfile']) {
      const dockerfile = readFileSync(path.resolve(file), 'utf8');
      expect(dockerfile).toContain('npm run build:local');
    }
    expect(frontendPackage.scripts['build:local']).toBe('vite build --mode shop');
    const nginx = readFileSync(path.resolve('nginx.conf'), 'utf8');
    const nginxCsp = nginx.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
    expect(nginxCsp).toContain('wss://agoouz-api.vercel.app');
    expect(nginxCsp).toMatch(/(?:^|\s)ws:(?:\s|$)/);
    expect(nginxCsp).not.toMatch(/(?:^|\s)http:(?:\s|$)/);
    expect(nginx).toContain('X-Content-Type-Options "nosniff" always');
    expect(nginx).toContain('X-Frame-Options "SAMEORIGIN" always');
    expect(nginx).toContain('Referrer-Policy "strict-origin-when-cross-origin" always');
    expect(
      readFileSync(path.resolve('../scripts/maintenance/update-project.ts'), 'utf8'),
    ).toContain('npm run build:local -w frontend');
    expect(readFileSync(path.resolve('../scripts/database/setup-project.ts'), 'utf8')).toContain(
      'npm run build:local',
    );
  });

  it('replaces exactly one HTML policy marker and fails on a missing marker', () => {
    const plugin = createCspMetaPlugin('production', hostedCsp);
    const html = '<meta http-equiv="Content-Security-Policy" content="__ERP_CSP_META__">';
    const transformed = plugin.transformIndexHtml(html);

    expect(transformed).not.toContain('__ERP_CSP_META__');
    expect(transformed).toContain("connect-src 'self' https://agoouz-api.vercel.app");
    expect(() => plugin.transformIndexHtml('<html></html>')).toThrow(/CSP meta marker/);
  });
});
