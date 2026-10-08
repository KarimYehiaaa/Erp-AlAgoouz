import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/salesService.ts', () => ({
  returnSale: vi.fn(async () => ({ id: 12 })),
}));

describe('sale return controller', () => {
  it('preserves the desktop reason when the legacy notes field is absent', async () => {
    const { sales } = await import('../src/controllers/salesController.ts');
    const salesService = await import('../src/services/salesService.ts');
    const req = {
      params: { id: '12' },
      user: { id: 7 },
      body: { reason: 'طلب العميل / مرتجع كاشير' },
    } as unknown as Request;
    const res = { json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    sales.return(req, res, next);
    await vi.waitFor(() => expect(salesService.returnSale).toHaveBeenCalledOnce());

    expect(salesService.returnSale).toHaveBeenCalledWith('12', 7, 'طلب العميل / مرتجع كاشير');
    expect(next).not.toHaveBeenCalled();
  });
});
