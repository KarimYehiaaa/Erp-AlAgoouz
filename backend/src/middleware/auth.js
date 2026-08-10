import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { query } from "../database/pool.js";
import { AppError } from "../types/errors.js";
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0637\u0644\u0648\u0628", 401, "UNAUTHORIZED");
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    const result = await query(
      `SELECT u.id, u.uuid, u.username, u.full_name, u.email, u.role_id, u.password_changed_at, r.name as role_name, r.name_ar as role_name_ar
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [decoded.userId]
    );
    if (!result.rows[0]) {
      throw new AppError("\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u063A\u064A\u0631 \u0646\u0634\u0637", 401, "UNAUTHORIZED");
    }
    const user = result.rows[0];
    if (user.password_changed_at) {
      const changedAtSec = Math.floor(new Date(user.password_changed_at).getTime() / 1e3);
      if (decoded.iat < changedAtSec) {
        throw new AppError(
          "\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631. \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649",
          401,
          "PASSWORD_CHANGED"
        );
      }
    }
    req.user = {
      userId: user.id,
      role: user.role_name || "",
      jti: decoded.jti
    };
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return next(new AppError("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0645\u0646\u062A\u0647\u064A \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629", 401, "INVALID_TOKEN"));
    }
    next(err);
  }
};
const authorize = (...permissions) => async (req, res, next) => {
  try {
    if (req.user?.role_name === "admin" || req.user?.role === "admin") return next();
    const roleId = req.user?.role_id;
    if (!roleId) throw new AppError("\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0643", 401, "UNAUTHORIZED");
    const result = await query(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.code = ANY($2)`,
      [roleId, permissions]
    );
    if (!result.rows.length) {
      throw new AppError("\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629", 403, "FORBIDDEN");
    }
    next();
  } catch (err) {
    next(err);
  }
};
const auditLog = (action, entityType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  const tryWriteAudit = async (payload) => {
    if (res.statusCode >= 400 || !req.user) return;
    try {
      const data = payload?.data ?? payload;
      const entityId = payload?.data?.id ?? payload?.data?.entity_id ?? payload?.data?.invoice_id ?? null;
      const userId = req.user?.id || req.user.userId;
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, entityType, entityId, JSON.stringify(data ?? {}), req.ip]
      );
    } catch (auditErr) {
      console.error("[AuditLog] \u0641\u0634\u0644 \u062D\u0641\u0638 \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642:", auditErr.message);
    }
  };
  res.json = async function(body) {
    await tryWriteAudit(body);
    return originalJson(body);
  };
  res.send = async function(body) {
    await tryWriteAudit(body);
    return originalSend(body);
  };
  next();
};
export {
  auditLog,
  authenticate,
  authorize
};
