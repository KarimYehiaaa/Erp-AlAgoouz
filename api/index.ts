import app from '../backend/src/app.ts';

export default async function handler(req: any, res: any) {
  // ═══════════════════════════════════════════════════════════════════════════
  // Vercel Serverless Entry Point
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // جميع الطلبات تأتي عبر rewrites في vercel.json:
  //   "/api/v1/(.*)" → "/api/index"
  //   "/api/(.*)"    → "/api/index"
  //   "/v1/(.*)"     → "/api/index"
  //   "/health"      → "/api/index"
  //
  // المسار الحقيقي يكون في x-now-route-matches أو req.url نفسه
  // ═══════════════════════════════════════════════════════════════════════════

  const routeMatches = req.headers['x-now-route-matches'] || '';
  const matchedPath = req.headers['x-matched-path'] || '';

  // تسجيل تشخيصي (Vercel Function Logs)
  console.log('[Vercel Route]', {
    url: req.url,
    originalUrl: req.originalUrl,
    matchedPath,
    routeMatches,
    method: req.method,
  });

  // ── الحالة 1: catch-all [...slug].ts intercepted (safety net) ──
  if (matchedPath.includes('[') && matchedPath.includes(']')) {
    const bareSlug = req.url;
    // ← Determine prefix from matched path
    //    "/api/v1/[...slug]" → prefix = "/api/v1"
    //    "/api/[...slug]"    → prefix = "/api"
    const prefix = matchedPath.replace(/\/\[.*$/, '');
    req.url = `${prefix}${bareSlug.startsWith('/') ? bareSlug : '/' + bareSlug}`;
    req.originalUrl = req.url;
  }
  // ── الحالة 2: rewrite → /api/index ──
  else if (
    req.url === '/api/index' ||
    req.url.startsWith('/api/index?') ||
    matchedPath === '/api/index'
  ) {
    let resolved = false;

    // أ) إذا كان matchedPath يحمل مساراً صالحاً مثل /health أو /api/v1/sales
    if (matchedPath && matchedPath !== '/api/index' && !matchedPath.includes('[')) {
      req.url = matchedPath;
      req.originalUrl = matchedPath;
      resolved = true;
    }

    // ب) استخراج المسار الحقيقي من x-now-route-matches إذا لم يُحل بعد
    if (!resolved && routeMatches) {
      try {
        const params = new URLSearchParams(routeMatches);
        const slug = params.get('1') || params.get('0');
        if (slug) {
          const decoded = decodeURIComponent(slug);
          const forwardedUri = req.headers['x-forwarded-uri'] || '';
          if (forwardedUri.startsWith('/api/v1/')) {
            req.url = `/api/v1/${decoded}`;
          } else if (forwardedUri.startsWith('/v1/')) {
            req.url = `/v1/${decoded}`;
          } else {
            req.url = `/api/${decoded}`;
          }
          req.originalUrl = req.url;
          resolved = true;
        }
      } catch {
        // ignore
      }
    }

    // ج) فحص هيدرز التحويل البديلة
    if (!resolved) {
      const fallback =
        req.headers['x-forwarded-uri'] ||
        req.headers['x-rewrite-url'] ||
        req.headers['x-original-url'];
      if (fallback && !fallback.includes('/api/index')) {
        req.url = fallback;
        req.originalUrl = req.url;
        resolved = true;
      }
    }

    // د) في حال بقي المسار /api/index ولم يتم استخراج أي مسار صالح، لا نقوم بتحويل وهمي لـ /health
    // بل يُترك ليعكس مسار 404 حقيقي دون إخفاء أي خلل في التوجيه
  }
  // ── الحالة 3: مسار سليم (محلي) ──
  // لا تعديل

  console.log('[Vercel Route] Final req.url:', req.url);

  try {
    return app(req, res);
  } catch (err: any) {
    console.error('❌ [Vercel Serverless Error]:', err);
    if (!res.headersSent) {
      const isDev = process.env.NODE_ENV === 'development';
      res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي غير متوقع في الخادم السحابي',
        ...(isDev ? { error: err.message, stack: err.stack } : {}),
      });
    }
  }
}
