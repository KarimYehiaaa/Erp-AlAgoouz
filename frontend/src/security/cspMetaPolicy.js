const marker = '__ERP_CSP_META__';

export function getCspMetaPolicy(mode, hostedPolicy, nativeVariant = 'Release') {
  if (!hostedPolicy) {
    throw new Error('Vercel security headers must define Content-Security-Policy.');
  }
  const additionalConnectSources =
    mode === 'native'
      ? [
          'https:',
          'wss:',
          ...(nativeVariant === 'Debug' ? ['http://10.0.2.2:*', 'ws://10.0.2.2:*'] : []),
        ]
      : mode === 'development'
        ? ['http:', 'ws:']
        : mode === 'shop'
          ? ['ws:']
          : [];
  return hostedPolicy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !directive.startsWith('frame-ancestors '))
    .map((directive) => {
      if (!additionalConnectSources.length || !directive.startsWith('connect-src ')) {
        return directive;
      }
      const sources = directive.split(/\s+/);
      for (const source of additionalConnectSources) {
        if (!sources.includes(source)) sources.push(source);
      }
      return sources.join(' ');
    })
    .join('; ');
}

export function createCspMetaPlugin(mode, hostedPolicy, nativeVariant = 'Release') {
  return {
    name: 'alagoouz-csp-meta-policy',
    transformIndexHtml(html) {
      if (html.split(marker).length !== 2) {
        throw new Error('Expected exactly one CSP meta marker in frontend/index.html.');
      }
      return html.replace(marker, getCspMetaPolicy(mode, hostedPolicy, nativeVariant));
    },
  };
}
