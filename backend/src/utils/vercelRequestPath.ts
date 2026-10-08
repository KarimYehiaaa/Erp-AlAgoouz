interface VercelRoutedRequest {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  originalUrl?: string;
}

function getHeader(request: VercelRoutedRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

/** Restore the public request path when a Vercel rewrite targets one API function. */
export function restoreVercelRequestPath(request: VercelRoutedRequest): void {
  const routeMatches = getHeader(request, 'x-now-route-matches');
  const matchedPath = getHeader(request, 'x-matched-path');

  if (matchedPath.includes('[') && matchedPath.includes(']')) {
    const prefix = matchedPath.replace(/\/\[.*$/, '');
    const bareSlug = request.url;
    request.url = `${prefix}${bareSlug.startsWith('/') ? bareSlug : `/${bareSlug}`}`;
    request.originalUrl = request.url;
    return;
  }

  if (
    request.url !== '/api/index' &&
    !request.url.startsWith('/api/index?') &&
    matchedPath !== '/api/index'
  ) {
    return;
  }

  if (matchedPath && matchedPath !== '/api/index' && !matchedPath.includes('[')) {
    request.url = matchedPath;
    request.originalUrl = matchedPath;
    return;
  }

  if (routeMatches) {
    try {
      const params = new URLSearchParams(routeMatches);
      const slug = params.get('1') || params.get('0');
      if (slug) {
        // URLSearchParams already decodes the header value once. Decoding again
        // would turn encoded route bytes such as %20 into a literal space.
        const forwardedUri = getHeader(request, 'x-forwarded-uri');
        if (forwardedUri.startsWith('/api/v1/')) request.url = `/api/v1/${slug}`;
        else if (forwardedUri.startsWith('/v1/')) request.url = `/v1/${slug}`;
        else request.url = `/api/${slug}`;
        request.originalUrl = request.url;
        return;
      }
    } catch {
      // Invalid Vercel routing metadata must fall through to the safe fallback.
    }
  }

  const fallback =
    getHeader(request, 'x-forwarded-uri') ||
    getHeader(request, 'x-rewrite-url') ||
    getHeader(request, 'x-original-url');
  if (fallback && !fallback.includes('/api/index')) {
    request.url = fallback;
    request.originalUrl = fallback;
  }
}
