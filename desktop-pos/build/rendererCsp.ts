const DEFAULT_CONNECT_ORIGINS = [
  'http://localhost:3000',
  // Match serverUrlPolicy's loopback addresses on custom ports and its IPv4 retry.
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://0.0.0.0:*',
  'https://agoouz.vercel.app',
];

function configuredOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    if (
      parsed.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function buildRendererContentSecurityPolicy(
  configuredServerUrls: string[] = [],
  development = false,
): string {
  const origins = [...DEFAULT_CONNECT_ORIGINS];
  for (const value of configuredServerUrls) {
    const origin = configuredOrigin(value);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }

  const connectSources = [
    "'self'",
    ...origins,
    'https://alagoouz.com',
    'https://*.alagoouz.com',
    'https://binalagoouz.com',
    'https://*.binalagoouz.com',
  ];
  if (development) connectSources.push('ws://localhost:5174', 'ws://127.0.0.1:5174');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `connect-src ${connectSources.join(' ')}`,
  ].join('; ');
}

export function createRendererContentSecurityPolicyPlugin(
  configuredServerUrls: string[] = [],
  development = false,
) {
  return {
    name: 'desktop-renderer-content-security-policy',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: buildRendererContentSecurityPolicy(configuredServerUrls, development),
          },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
  };
}
