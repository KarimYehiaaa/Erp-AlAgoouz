import { describe, expect, it } from 'vitest';
import {
  buildRendererContentSecurityPolicy,
  createRendererContentSecurityPolicyPlugin,
} from '../build/rendererCsp';
import { isAllowedExternalUrl } from '../electron/security/rendererSecurityPolicy';
import { validateServerUrl } from '../src/services/serverUrlPolicy';

describe('desktop renderer security policy', () => {
  it.each(['localhost', '127.0.0.1', '0.0.0.0'])(
    'permits the configured loopback API port accepted by the server policy: %s',
    (host) => {
      expect(validateServerUrl(`http://${host}:60358/api/v1`, true).valid).toBe(true);
      const policy = buildRendererContentSecurityPolicy();
      const sources = policy
        .split('; ')
        .find((directive) => directive.startsWith('connect-src '))!
        .split(' ');
      expect(sources).toContain(`http://${host}:*`);
      expect(sources).not.toContain('http:');
      expect(sources).not.toContain('*');
    },
  );

  it('limits scripts, objects, frames, and forms while preserving local and production APIs', () => {
    const policy = buildRendererContentSecurityPolicy();
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain('http://localhost:3000');
    expect(policy).toContain('https://agoouz.vercel.app');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('adds only safe configured server origins and development HMR sockets', () => {
    const policy = buildRendererContentSecurityPolicy(
      [
        'https://api.example.test/api/v1',
        'http://192.168.1.20:3000',
        'javascript:alert(1)',
        'https://user:secret@unsafe.example.test',
      ],
      true,
    );
    expect(policy).toContain('https://api.example.test');
    expect(policy).toContain('ws://localhost:5174');
    expect(policy).not.toContain('192.168.1.20');
    expect(policy).not.toContain('unsafe.example.test');
  });

  it('injects the production policy before scripts in the document head', () => {
    const plugin = createRendererContentSecurityPolicyPlugin(['https://api.example.test'], false);
    const [tag] = plugin.transformIndexHtml();
    expect(tag.tag).toBe('meta');
    expect(tag.injectTo).toBe('head-prepend');
    expect(tag.attrs['http-equiv']).toBe('Content-Security-Policy');
    expect(tag.attrs.content).toContain('https://api.example.test');
    expect(tag.attrs.content).not.toContain('ws://localhost:5174');
  });

  it.each([
    'https://agoouz.vercel.app/help',
    'https://pos.alagoouz.com',
    'https://binalagoouz.com',
  ])('allows approved external HTTPS URL %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    'http://agoouz.vercel.app',
    'https://agoouz.vercel.app.attacker.test',
    'https://alagoouz.com.attacker.test',
    'https://attacker.test',
    'javascript:alert(1)',
    'https://user@agoouz.vercel.app',
  ])('rejects unsafe external URL %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
