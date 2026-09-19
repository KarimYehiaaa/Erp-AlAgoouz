import * as authService from '../services/authService.ts';
import config from '../config/index.ts';

/** إعدادات مشتركة لـ cookies الأمنية. */
const cookieDefaults = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: (config.isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: maxAgeMs,
});

/**
 * تسجيل الدخول وإصدار توكنات الوصول والانعاش.
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { refreshToken, ...data } = await authService.login(username, password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    // HttpOnly cookies — حماية من سرقة التوكن عبر XSS
    res.cookie('access_token', data.token, {
      ...cookieDefaults(8 * 60 * 60 * 1e3), // 8 ساعات
      path: '/',
    });
    res.cookie('refresh_token', refreshToken, {
      ...cookieDefaults(7 * 24 * 60 * 60 * 1e3), // 7 أيام
      path: '/api/v1/auth',
    });
    res.json({ success: true, data });
  } catch (err: any) {
    next(err);
  }
};
/**
 * جلب ملف المستخدم الحالي المسجل دخوله.
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
 */
const profile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const data = await authService.getProfile(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    next(err);
  }
};
/**
 * تجديد توكن الوصول باستخدام توكن الانعاش.
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
 */
const refresh = async (req, res, next) => {
  try {
    // Web clients use the HttpOnly cookie only. The desktop client uses its
    // OS-protected session store, so it is allowed to send the rotated token
    // through the explicitly identified desktop channel.
    const isDesktopClient = req.get('x-client-type') === 'desktop-pos';
    const refreshToken =
      req.cookies?.refresh_token ||
      (isDesktopClient ? req.body?.refreshToken || req.get('x-refresh-token') : undefined);
    if (!refreshToken)
      return res.status(401).json({ success: false, message: 'رمز التحديث (Refresh token) مطلوب' });
    const data = await authService.refreshAccessToken(refreshToken);
    // تحديث الـ cookies بالتوكنات الجديدة
    res.cookie('access_token', data.token, {
      ...cookieDefaults(8 * 60 * 60 * 1e3),
      path: '/',
    });
    res.cookie('refresh_token', data.refreshToken, {
      ...cookieDefaults(7 * 24 * 60 * 60 * 1e3),
      path: '/api/v1/auth',
    });
    const { refreshToken: _ignoredRefreshToken, ...responseData } = data;
    void _ignoredRefreshToken;
    res.json({ success: true, data: responseData });
  } catch (err: any) {
    next(err);
  }
};
/**
 * تسجيل الخروج وإبطال جلسة المستخدم الحالية.
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
 */
const logoutHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    await authService.logout(userId);
    // مسح كل cookies الجلسة
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
    });
  } catch (err: any) {
    next(err);
  }
};
export { login, logoutHandler, profile, refresh };
