class AppError extends Error {
  statusCode: number;
  code?: string;
  isOperational: boolean;
  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
class AuthError extends AppError {
  constructor(message, code) {
    super(message, 401, code ?? 'AUTH_ERROR');
  }
}
class ForbiddenError extends AppError {
  constructor(
    message = '\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629',
  ) {
    super(message, 403, 'FORBIDDEN');
  }
}
class NotFoundError extends AppError {
  constructor(resource = '\u0627\u0644\u0645\u0648\u0631\u062F') {
    super(`${resource} \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F`, 404, 'NOT_FOUND');
  }
}
class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}
export { AppError, AuthError, ConflictError, ForbiddenError, NotFoundError, ValidationError };
