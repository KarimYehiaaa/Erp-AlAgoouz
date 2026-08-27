/**
 * routes/auth.routes.ts — المصادقة ولوحة التحكم
 * مسارات تسجيل الدخول/الخروج/التجديد + لوحة التحكم والتنبيهات وسجل التدقيق.
 * تضم حمايات Brute-Force (loginLimiter/refreshLimiter).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.ts';
import { authenticate, authorize } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { loginSchema } from './schemas.ts';
import * as authCtrl from '../controllers/authController.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// BUG-13 FIX: تقليل الحد من 150 محاولة/5د إلى 10 محاولات/15د — حماية من Brute-Force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10, // 10 محاولات فقط
  message: { success: false, message: 'تم تجاوز محاولات الدخول. حاول مرة أخرى بعد 15 دقيقة.' },
  skipSuccessfulRequests: true,
  skip: (_req) => config.isDevelopment,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'تم تجاوز محاولات تجديد الجلسة. حاول مرة أخرى بعد 15 دقيقة.',
  },
  skipSuccessfulRequests: true,
  skip: (_req) => config.isDevelopment,
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', loginLimiter, validateBody(loginSchema), authCtrl.login);
router.get('/auth/profile', authenticate, authCtrl.profile);
router.post('/auth/refresh', refreshLimiter, authCtrl.refresh);
router.post('/auth/logout', authenticate, authCtrl.logoutHandler);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, authorize('dashboard.view'), api.dashboard);
router.get('/operations/alerts', authenticate, authorize('dashboard.view'), api.operations.alerts);
router.get(
  '/operations/audit-logs',
  authenticate,
  authorize('reports.view'),
  api.operations.auditLogs,
);

/**
 * موجّه المصادقة ولوحة التحكم.
 */
export default router;
