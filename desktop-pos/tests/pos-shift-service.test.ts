import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../src/services/api', () => ({ api: { post } }));

import { recordCashMovement } from '../src/services/posShiftService';

describe('POS shift cash movements', () => {
  beforeEach(() => post.mockReset());

  it('posts the drawer movement to the backend route with the complete payload', async () => {
    const payload = {
      shift_id: 47,
      movement_type: 'WITHDRAWAL' as const,
      amount: 125,
      reason: 'توريد نقدية للخزينة',
    };
    post.mockResolvedValue({ data: { success: true } });

    await recordCashMovement(payload);

    expect(post).toHaveBeenCalledWith('/pos/shifts/cash-movement', payload);
  });
});
