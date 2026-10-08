import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AppError } from '../src/types/errors.ts';
import {
  requireApprovalAuthority,
  requireGlobalReportAccess,
} from '../src/routes/managerMobile.routes.ts';

const authorize = (middleware: typeof requireApprovalAuthority, role: string) => {
  const req = { user: { role_name: role } } as unknown as Request;
  const next = vi.fn();

  middleware(req, {} as Response, next);

  return next;
};

describe('manager mobile authorization', () => {
  it('allows a manager to view shop-wide reports and decide POS approval requests', () => {
    const reportNext = authorize(requireGlobalReportAccess, 'manager');
    const approvalNext = authorize(requireApprovalAuthority, 'manager');

    expect(reportNext).toHaveBeenCalledOnce();
    expect(reportNext).toHaveBeenCalledWith();
    expect(approvalNext).toHaveBeenCalledOnce();
    expect(approvalNext).toHaveBeenCalledWith();
  });

  it('keeps cashier roles out of manager reports and approval decisions', () => {
    const reportNext = authorize(requireGlobalReportAccess, 'cashier');
    const approvalNext = authorize(requireApprovalAuthority, 'cashier');

    expect(reportNext).toHaveBeenCalledOnce();
    expect(reportNext.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect((reportNext.mock.calls[0]?.[0] as AppError).statusCode).toBe(403);
    expect(approvalNext).toHaveBeenCalledOnce();
    expect(approvalNext.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect((approvalNext.mock.calls[0]?.[0] as AppError).statusCode).toBe(403);
  });
});
