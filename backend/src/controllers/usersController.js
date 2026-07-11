import * as userService from '../services/userService.js';
import { ok } from './helper.js';

export const users = {
  list: async (req, res, next) => { try { ok(res, await userService.getUsers()); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await userService.createUser(req.body, req.user.id), 'تم إنشاء المستخدم بنجاح'); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await userService.updateUser(req.params.id, req.body, req.user.id), 'تم تحديث المستخدم بنجاح'); } catch (e) { next(e); } },
  delete: async (req, res, next) => { try { ok(res, await userService.deleteUser(req.params.id, req.user.id), 'تم حذف المستخدم بنجاح'); } catch (e) { next(e); } },
  roles: async (req, res, next) => { try { ok(res, await userService.getRoles()); } catch (e) { next(e); } },
  notifications: async (req, res, next) => { try { ok(res, await userService.getNotifications(req.user.id)); } catch (e) { next(e); } },
  settings: async (req, res, next) => { try { ok(res, await userService.getSettings()); } catch (e) { next(e); } },
  updateSetting: async (req, res, next) => { try { await userService.upsertSetting(req.params.key, req.body.value, req.user.id); ok(res, null); } catch (e) { next(e); } },
  reports: async (req, res, next) => { try { ok(res, await userService.getReports(req.params.type, req.query)); } catch (e) { next(e); } },
};
