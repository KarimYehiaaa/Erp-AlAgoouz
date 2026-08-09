import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../types/errors.js';

export const validate = (schema: AnyZodObject) => (req: Request & { validated?: any }, res: Response, next: NextFunction) => {
  try {
    const data = { ...req.body, ...req.params, ...req.query };
    const parsed = schema.parse(data);
    req.validated = parsed;
    next();
  } catch (err: any) {
    const message =
      (err as ZodError).errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};

export const validateBody = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err: any) {
    const message =
      (err as ZodError).errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};

export const validateQuery = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (err: any) {
    const message =
      (err as ZodError).errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
