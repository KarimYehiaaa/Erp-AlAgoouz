import { describe, it, expect, vi } from 'vitest';
import { upload, requireAdmin } from '../src/routes/helpers';
import type { Request, Response, NextFunction } from 'express';

describe('Upload Security & Middleware Verification', () => {
  it('enforces memoryStorage to prevent path traversal and arbitrary disk writes', () => {
    // Multer instance uses memoryStorage
    expect(upload.storage).toBeDefined();
    // Limits check: 5MB max
    expect(upload.limits).toBeDefined();
    expect(upload.limits?.fileSize).toBe(5 * 1024 * 1024);
  });

  it('fileFilter accepts allowed MIME types', () => {
    const filter = upload.fileFilter;
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/json',
      'application/sql',
      'application/gzip',
    ];

    for (const mime of allowed) {
      let accepted = false;
      let error: any = null;
      filter({} as any, { mimetype: mime } as any, (err: any, pass?: boolean) => {
        error = err;
        accepted = !!pass;
      });
      expect(error, `MIME ${mime} should not produce error`).toBeNull();
      expect(accepted, `MIME ${mime} should be accepted`).toBe(true);
    }
  });

  it('fileFilter strictly rejects dangerous or unauthorized MIME types', () => {
    const filter = upload.fileFilter;
    const dangerous = [
      'application/x-msdownload', // .exe
      'application/javascript', // .js
      'text/html', // .html (XSS)
      'application/x-sh', // .sh
      'application/x-bat', // .bat
      'application/x-php', // .php
    ];

    for (const mime of dangerous) {
      let accepted = false;
      let error: any = null;
      filter({} as any, { mimetype: mime } as any, (err: any, pass?: boolean) => {
        error = err;
        accepted = !!pass;
      });
      expect(error, `Dangerous MIME ${mime} must be rejected with error`).toBeInstanceOf(Error);
      expect(accepted, `Dangerous MIME ${mime} must not be accepted`).toBe(false);
    }
  });

  it('requireAdmin allows admin users to proceed', () => {
    const req = { user: { id: 1, role_name: 'admin' } } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('requireAdmin strictly blocks non-admin users with 403', () => {
    const roles = ['cashier', 'accountant', 'branch_manager', 'inventory_manager'];

    for (const role of roles) {
      const req = { user: { id: 2, role_name: role } } as unknown as Request;
      const statusFn = vi.fn().mockReturnThis();
      const jsonFn = vi.fn();
      const res = { status: statusFn, json: jsonFn } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      requireAdmin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'هذه العملية متاحة للمدير فقط' })
      );
    }
  });

  it('requireAdmin blocks unauthenticated requests with 403', () => {
    const req = {} as unknown as Request;
    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();
    const res = { status: statusFn, json: jsonFn } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(403);
  });
});
