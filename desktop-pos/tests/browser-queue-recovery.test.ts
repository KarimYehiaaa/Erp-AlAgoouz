import { describe, expect, it } from 'vitest';
import {
  getBrowserQueueRecoverySnapshot,
  getBrowserQueueRetentionSummary,
} from '../src/services/browserQueue';

const storageFrom = (entries: Array<[string, string]>) => {
  const values = new Map(entries);
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
  } as Storage;
};

describe('browser POS queue recovery export', () => {
  it('counts only unsynced legacy and other-context records', () => {
    const context = 'http://localhost:3000/api/v1::4';
    const storage = storageFrom([
      ['pos_offline_sales', JSON.stringify([{ status: 'PENDING' }, { status: 'SYNCED' }])],
      [`pos_offline_sales:${encodeURIComponent(context)}`, JSON.stringify([{ status: 'PENDING' }])],
      [
        `pos_offline_sales:${encodeURIComponent('http://other/api/v1::8')}`,
        JSON.stringify([{ status: 'FAILED' }, { status: 'SYNCED' }]),
      ],
    ]);

    expect(getBrowserQueueRetentionSummary(storage, context)).toEqual({
      success: true,
      unknownCount: 1,
      otherContextCount: 1,
    });
  });

  it('reports an unreadable legacy queue instead of hiding it', () => {
    const storage = storageFrom([['pos_offline_sales', '{broken']]);
    expect(getBrowserQueueRetentionSummary(storage, 'http://localhost:3000/api/v1::4')).toEqual({
      success: false,
      unknownCount: 0,
      otherContextCount: 0,
    });
  });

  it('preserves legacy and namespaced queue data without changing or assigning ownership', () => {
    const legacy = JSON.stringify([{ sync_id: 'old-sale', total_amount: 20 }]);
    const current = JSON.stringify([{ sync_id: 'current-sale', total_amount: 30 }]);
    const storage = storageFrom([
      ['pos_offline_sales', legacy],
      ['pos_offline_sales:https%3A%2F%2Fagoouz.vercel.app%2Fapi%2Fv1%3A%3A4', current],
      ['pos_user', '{"id":4}'],
    ]);

    const snapshot = getBrowserQueueRecoverySnapshot(storage);

    expect(snapshot.queues).toEqual([
      { key: 'pos_offline_sales', raw: legacy, recordCount: 1 },
      {
        key: 'pos_offline_sales:https%3A%2F%2Fagoouz.vercel.app%2Fapi%2Fv1%3A%3A4',
        raw: current,
        recordCount: 1,
      },
    ]);
    expect(snapshot.note).toContain('No records were reassigned');
    expect(storage.getItem('pos_offline_sales')).toBe(legacy);
    expect(
      storage.getItem('pos_offline_sales:https%3A%2F%2Fagoouz.vercel.app%2Fapi%2Fv1%3A%3A4'),
    ).toBe(current);
  });

  it('retains corrupt queue bytes for manual recovery', () => {
    const corrupt = '{partial queue data';
    const snapshot = getBrowserQueueRecoverySnapshot(storageFrom([['pos_offline_sales', corrupt]]));
    expect(snapshot.queues).toEqual([
      { key: 'pos_offline_sales', raw: corrupt, recordCount: null },
    ]);
  });

  it('fails clearly when no POS queue exists', () => {
    expect(() => getBrowserQueueRecoverySnapshot(storageFrom([['theme', 'dark']]))).toThrow(
      'لا توجد طوابير فواتير محلية للتصدير',
    );
  });
});
