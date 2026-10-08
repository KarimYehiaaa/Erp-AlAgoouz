import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  getClient: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../src/database/pool.ts', () => database);

describe('independent product return sale linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a linked sale before opening a transaction or changing stock', async () => {
    const { returnProductToStock } = await import('../src/services/inventoryService.ts');

    await expect(returnProductToStock({ sale_id: 123 }, 7)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(database.getClient).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });
});
