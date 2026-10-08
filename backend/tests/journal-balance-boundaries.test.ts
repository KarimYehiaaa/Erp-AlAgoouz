import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { getClient } from '../src/database/pool.ts';

let client: PoolClient;
let account: number;
let actor: number;

beforeEach(async () => {
  client = await getClient();
  await client.query('BEGIN');
  account = Number((await client.query("SELECT id FROM accounts WHERE code='1101'")).rows[0].id);
  actor = Number(
    (
      await client.query(
        "SELECT id FROM users WHERE role_id=(SELECT id FROM roles WHERE name='admin') LIMIT 1",
      )
    ).rows[0].id,
  );
});
afterEach(async () => {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

const journal = async (status: 'draft' | 'posted', debit = 80, credit = 80) => {
  const id = Number(
    (
      await client.query(
        `INSERT INTO journal_entries(entry_number,entry_date,status,reference_type,description,created_by)
     VALUES($1,CURRENT_DATE,$2,'manual','Balance boundary fixture',$3) RETURNING id`,
        [`JB-${randomUUID()}`, status, actor],
      )
    ).rows[0].id,
  );
  const lines = await client.query(
    `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit,credit)
     VALUES($1,$2,$3,0),($1,$2,0,$4) RETURNING id`,
    [id, account, debit, credit],
  );
  return { id, debitLine: Number(lines.rows[0].id), creditLine: Number(lines.rows[1].id) };
};
const flushInitialEvents = async () => {
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await client.query('SET CONSTRAINTS ALL DEFERRED');
};
const balances = async (ids: number[]) =>
  (
    await client.query(
      `SELECT je.id,je.status,COALESCE(SUM(l.debit),0)::numeric AS debit,
   COALESCE(SUM(l.credit),0)::numeric AS credit FROM journal_entries je
   LEFT JOIN journal_entry_lines l ON l.journal_entry_id=je.id
   WHERE je.id=ANY($1::int[]) GROUP BY je.id ORDER BY je.id`,
      [ids],
    )
  ).rows;

describe('deferred database balance protection across header and line ownership changes', () => {
  it('protects a historical voided journal that remains effective through its reversal', async () => {
    const original = await journal('posted');
    const reversal = await journal('posted');
    await client.query(
      "UPDATE journal_entries SET reference_type='reversal',reference_id=$1 WHERE id=$2",
      [original.id, reversal.id],
    );
    await client.query("UPDATE journal_entries SET status='voided' WHERE id=$1", [original.id]);
    await flushInitialEvents();
    await client.query('SAVEPOINT before_historical_edit');
    await client.query('UPDATE journal_entry_lines SET credit=70 WHERE id=$1', [
      original.creditLine,
    ]);
    await expect(client.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow('غير متوازن');
    await client.query('ROLLBACK TO SAVEPOINT before_historical_edit');
    expect(await balances([original.id])).toEqual([
      { id: original.id, status: 'voided', debit: 80, credit: 80 },
    ]);
  });

  it('checks the original balance when a reversal makes an inactive historical journal effective', async () => {
    const original = await journal('draft', 80, 70);
    await client.query("UPDATE journal_entries SET status='voided' WHERE id=$1", [original.id]);
    const reversal = await journal('posted');
    await flushInitialEvents();
    await client.query('SAVEPOINT before_link');
    await client.query(
      "UPDATE journal_entries SET reference_type='reversal',reference_id=$1 WHERE id=$2",
      [original.id, reversal.id],
    );
    await expect(client.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow('غير متوازن');
    await client.query('ROLLBACK TO SAVEPOINT before_link');
    expect(await balances([original.id])).toEqual([
      { id: original.id, status: 'voided', debit: 80, credit: 70 },
    ]);
  });

  it('serializes a concurrent draft promotion and line change before validating the final balance', async () => {
    const draft = await journal('draft');
    await client.query('COMMIT');
    const promoter = await getClient();
    const lineWriter = await getClient();
    let validation: Promise<{ accepted: boolean; message: string }> | undefined;
    try {
      await promoter.query('BEGIN');
      await lineWriter.query('BEGIN');
      const promoterPid = Number(
        (await promoter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
      );
      const writerPid = Number(
        (await lineWriter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
      );
      await promoter.query("UPDATE journal_entries SET status='posted' WHERE id=$1", [draft.id]);
      await lineWriter.query('UPDATE journal_entry_lines SET credit=70 WHERE id=$1', [
        draft.creditLine,
      ]);
      validation = lineWriter.query('SET CONSTRAINTS ALL IMMEDIATE').then(
        () => ({ accepted: true, message: '' }),
        (error: Error) => ({ accepted: false, message: error.message }),
      );
      await vi.waitFor(
        async () => {
          const state = await client.query(
            'SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS waiting',
            [promoterPid, writerPid],
          );
          expect(state.rows[0].waiting).toBe(true);
        },
        { timeout: 5000, interval: 50 },
      );
      await promoter.query('COMMIT');
      const result = await validation;
      expect(result.accepted).toBe(false);
      expect(result.message).toContain('غير متوازن');
      await lineWriter.query('ROLLBACK');
      expect(await balances([draft.id])).toEqual([
        { id: draft.id, status: 'posted', debit: 80, credit: 80 },
      ]);
    } finally {
      await promoter.query('ROLLBACK');
      if (validation) await validation;
      await lineWriter.query('ROLLBACK');
      promoter.release();
      lineWriter.release();
      await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id=$1', [draft.id]);
      await client.query('DELETE FROM journal_entries WHERE id=$1', [draft.id]);
    }
  });

  it('rejects promoting an existing unbalanced draft without editing any line', async () => {
    const draft = await journal('draft', 80, 70);
    await flushInitialEvents();
    await client.query('SAVEPOINT before_promotion');
    await client.query("UPDATE journal_entries SET status='posted' WHERE id=$1", [draft.id]);
    await expect(client.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow('غير متوازن');
    await client.query('ROLLBACK TO SAVEPOINT before_promotion');
    expect(await balances([draft.id])).toEqual([
      { id: draft.id, status: 'draft', debit: 80, credit: 70 },
    ]);
  });

  it('checks the old posted journal when its credit line is moved to a draft journal', async () => {
    const posted = await journal('posted');
    const draft = await journal('draft', 10, 10);
    await flushInitialEvents();
    await client.query('SAVEPOINT before_move');
    await client.query('UPDATE journal_entry_lines SET journal_entry_id=$1 WHERE id=$2', [
      draft.id,
      posted.creditLine,
    ]);
    await expect(client.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow('غير متوازن');
    await client.query('ROLLBACK TO SAVEPOINT before_move');
    expect(await balances([posted.id, draft.id])).toEqual([
      { id: posted.id, status: 'posted', debit: 80, credit: 80 },
      { id: draft.id, status: 'draft', debit: 10, credit: 10 },
    ]);
  });

  it('allows a balanced draft promotion and an atomic relocation of both sides', async () => {
    const original = await journal('posted');
    const draft = await journal('draft', 10, 10);
    await flushInitialEvents();
    await client.query("UPDATE journal_entries SET status='posted' WHERE id=$1", [draft.id]);
    await client.query(
      'UPDATE journal_entry_lines SET journal_entry_id=$1 WHERE id=ANY($2::int[])',
      [draft.id, [original.debitLine, original.creditLine]],
    );
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    expect(await balances([original.id, draft.id])).toEqual([
      { id: original.id, status: 'posted', debit: 0, credit: 0 },
      { id: draft.id, status: 'posted', debit: 90, credit: 90 },
    ]);
  });
});
