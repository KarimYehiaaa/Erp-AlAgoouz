/** Shared hosted policy. Outbound browser connections are limited to the app API. */
export const productionContentSecurityPolicy = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameSrc: ["'none'"],
  frameAncestors: ["'self'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
  connectSrc: [
    "'self'",
    'https://agoouz-api.vercel.app',
    'wss://agoouz-api.vercel.app',
    'wss://agoouz.vercel.app',
  ],
  fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
  workerSrc: ["'self'", 'blob:'],
} as const;

/** Local HTTP installs need ws:// for realtime on the shop's LAN. */
export const localProductionContentSecurityPolicy = {
  ...productionContentSecurityPolicy,
  connectSrc: [...productionContentSecurityPolicy.connectSrc, 'ws:'],
} as const;

export const productionContentSecurityPolicyHeader = Object.entries(productionContentSecurityPolicy)
  .map(
    ([name, sources]) =>
      `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} ${sources.join(' ')}`,
  )
  .join('; ');

/** Native WebView clients also connect to the shop server over its configured LAN URL. */
export const nativeContentSecurityPolicyHeader = Object.entries(productionContentSecurityPolicy)
  .filter(([name]) => name !== 'frameAncestors')
  .map(
    ([name, sources]) =>
      `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} ${[
        ...sources,
        ...(name === 'connectSrc' ? ['http:', 'ws:'] : []),
      ].join(' ')}`,
  )
  .join('; ');
