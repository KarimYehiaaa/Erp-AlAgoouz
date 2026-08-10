import * as userService from "../services/userService.js";
import { ok } from "./helper.js";
const users = {
  list: async (req, res, next) => {
    try {
      ok(res, await userService.getUsers());
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      ok(res, await userService.createUser(req.body), "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  update: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.updateUser(Number(req.params.id), req.body),
        "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D"
      );
    } catch (e) {
      next(e);
    }
  },
  delete: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      ok(res, await userService.deleteUser(Number(req.params.id), userId), "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  roles: async (req, res, next) => {
    try {
      ok(res, await userService.getRoles());
    } catch (e) {
      next(e);
    }
  },
  createRole: async (req, res, next) => {
    try {
      ok(res, await userService.createRole(req.body), "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  updateRole: async (req, res, next) => {
    try {
      ok(res, await userService.updateRole(Number(req.params.id), req.body), "\u062A\u0645 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  deleteRole: async (req, res, next) => {
    try {
      ok(res, await userService.deleteRole(Number(req.params.id)), "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  notifications: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      ok(res, await userService.getNotifications(userId));
    } catch (e) {
      next(e);
    }
  },
  settings: async (req, res, next) => {
    try {
      ok(res, await userService.getSettings());
    } catch (e) {
      next(e);
    }
  },
  updateSetting: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      await userService.upsertSetting(req.params.key, req.body.value, userId);
      ok(res, null);
    } catch (e) {
      next(e);
    }
  },
  reports: async (req, res, next) => {
    try {
      ok(res, await userService.getReports(req.params.type, req.query));
    } catch (e) {
      next(e);
    }
  },
  listPermissions: async (req, res, next) => {
    try {
      ok(res, await userService.getPermissions());
    } catch (e) {
      next(e);
    }
  },
  getRolePermissions: async (req, res, next) => {
    try {
      ok(res, await userService.getRolePermissions(Number(req.params.id)));
    } catch (e) {
      next(e);
    }
  },
  updateRolePermissions: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.updateRolePermissions(Number(req.params.id), req.body.permissionIds),
        "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u062F\u0648\u0631 \u0628\u0646\u062C\u0627\u062D"
      );
    } catch (e) {
      next(e);
    }
  }
};
export {
  users
};
