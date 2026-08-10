import { logger } from "../services/loggerService.js";
import { AppError } from "../types/errors.js";
const classifyDbError = (err) => {
  if (err.code === "23505") {
    const col = err.detail?.match(/Key \((.+?)\)/)?.[1] || "\u0627\u0644\u062D\u0642\u0644";
    return new AppError(`\u0627\u0644\u0642\u064A\u0645\u0629 \u0645\u0643\u0631\u0631\u0629 \u0641\u064A: ${col}`, 409, "DUPLICATE_KEY");
  }
  if (err.code === "23503") {
    return new AppError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062D\u0630\u0641: \u064A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0631\u062A\u0628\u0637\u0629", 409, "FOREIGN_KEY_VIOLATION");
  }
  if (err.code === "23502") {
    const col = err.column || "\u062D\u0642\u0644 \u0645\u0637\u0644\u0648\u0628";
    return new AppError(`${col} \u0645\u0637\u0644\u0648\u0628 \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0641\u0627\u0631\u063A\u0627\u064B`, 400, "NOT_NULL_VIOLATION");
  }
  if (err.code === "57014") {
    return new AppError("\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u2014 \u0627\u0644\u0627\u0633\u062A\u0639\u0644\u0627\u0645 \u0627\u0633\u062A\u063A\u0631\u0642 \u0648\u0642\u062A\u0627\u064B \u0637\u0648\u064A\u0644\u0627\u064B", 504, "QUERY_TIMEOUT");
  }
  if (["ECONNREFUSED", "ENOTFOUND", "08003", "08006", "08001", "08004"].includes(err.code)) {
    return new AppError("\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u2014 \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644", 503, "DB_UNAVAILABLE");
  }
  if (err.code === "23514") {
    return new AppError("\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u062F\u062E\u0644\u0629 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627", 400, "CHECK_VIOLATION");
  }
  return null;
};
const notFound = (req, res, next) => {
  next(new AppError(`\u0627\u0644\u0635\u0641\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629: ${req.originalUrl}`, 404, "NOT_FOUND"));
};
const errorHandler = (err, req, res, _next) => {
  const classified = classifyDbError(err);
  const finalErr = classified || err;
  const statusCode = finalErr.statusCode || 500;
  const message = finalErr.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639";
  const code = finalErr.code || "INTERNAL_ERROR";
  const requestId = req.requestId || "N/A";
  const userId = req.user?.id;
  if (statusCode >= 500) {
    logger.error({
      message: `[${requestId}] Internal Error: ${message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId,
      stack: err.stack,
      pgCode: err.code
      // PostgreSQL error code إن وجد
    });
  } else if (statusCode >= 400) {
    logger.warn({
      message: `[${requestId}] Client Error (${statusCode}): ${message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId
    });
  }
  res.status(statusCode).json({
    success: false,
    message,
    code,
    requestId,
    // تفاصيل إضافية في بيئة التطوير فقط
    ...process.env.NODE_ENV !== "production" && err.stack ? { stack: err.stack, pgCode: err.code } : {}
  });
};
export {
  errorHandler,
  notFound
};
