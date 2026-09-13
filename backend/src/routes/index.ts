/**
 * routes/index.ts — الراوتر الرئيسي (جامع الوحدات)
 * يجمع كل وحدات التوجيه النطاقية في موجّه واحد يُسجَّل في التطبيق.
 * كل وحدة مسؤولة عن نطاقها:
 *  - auth      : المصادقة + لوحة التحكم
 *  - sales     : المبيعات + العملاء + المصروفات
 *  - products  : المنتجات + المشتريات + الموردون
 *  - inventory : المخزون + الجرد + الفواتير + عروض الأسعار
 *  - costs     : التكاليف والوصفات
 *  - hr        : الموارد البشرية + المستخدمون + الإعدادات
 *  - reports   : التقارير والتنبؤ الذكي
 *  - admin     : النسخ الاحتياطي ولوحة الإدارة
 *
 * مخططات التحقق (Zod Schemas) مُعرَّفة في: ./schemas.ts
 */
import { Router } from 'express';
import authRoutes from './auth.routes.ts';
import salesRoutes from './sales.routes.ts';
import productsRoutes from './products.routes.ts';
import inventoryRoutes from './inventory.routes.ts';
import costsRoutes from './costs.routes.ts';
import hrRoutes from './hr.routes.ts';
import reportsRoutes from './reports.routes.ts';
import adminRoutes from './admin.routes.ts';
import menuRoutes from './menu.routes.ts';
import telegramRoutes from './telegram.routes.ts';
import syncRoutes from './sync.routes.ts';
import partnersRoutes from './partners.routes.ts';
import automationRoutes from './automation.routes.ts';
import posRoutes from './pos.routes.ts';
import managerMobileRoutes from './managerMobile.routes.ts';

const router = Router();

router.use(authRoutes);
router.use(salesRoutes);
router.use(productsRoutes);
router.use(inventoryRoutes);
router.use(costsRoutes);
router.use(hrRoutes);
router.use(reportsRoutes);
router.use(adminRoutes);
router.use(menuRoutes);
router.use(telegramRoutes);
router.use(syncRoutes);
router.use(partnersRoutes);
router.use(automationRoutes);
router.use(posRoutes);
router.use(managerMobileRoutes);

/**
 * موجّه API الرئيسي — يُسجَّل في التطبيق ويجمع كل مسارات النظام (المصادقة، المبيعات، المخزون، الموارد البشرية...).
 */
export default router;
