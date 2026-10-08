import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { query } from '../src/database/pool.ts';
import { managerMobileController } from '../src/controllers/managerMobileController.ts';

const userIds: number[] = [];
let approvalId: number;
const token = 'test-only-owner-override-token';

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 12);
  for (const [index, role] of ['cashier', 'cashier', 'admin'].entries()) {
    const inserted = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id)
       SELECT $1, 'test-only', 'Approval privacy fixture', id FROM roles WHERE name = $2
       RETURNING id`,
      [`privacy-${index}-${suffix}`, role],
    );
    expect(inserted.rows).toHaveLength(1);
    userIds.push(Number(inserted.rows[0].id));
  }
  approvalId = Number(
    (
      await query(
        `INSERT INTO manager_approval_requests
           (requester_user_id, action_label, status, override_token, decided_by_user_id)
         VALUES ($1, 'Privacy fixture', 'approved', $2, $3) RETURNING id`,
        [userIds[0], token, userIds[2]],
      )
    ).rows[0].id,
  );
});

afterAll(async () => {
  if (approvalId) await query(`DELETE FROM manager_approval_requests WHERE id = $1`, [approvalId]);
  if (userIds.length) await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [userIds]);
});

const poll = async (userIndex: number, role: string, id = approvalId) => {
  // Authentication already supplies this identity at the controller boundary.
  // Real PostgreSQL executes the lookup; only Express transport is represented here.
  const req = {
    params: { id: String(id) },
    user: { id: userIds[userIndex], role_name: role },
  } as unknown as Request;
  const json = vi.fn();
  const next = vi.fn();
  await managerMobileController.checkApprovalStatus(req, { json } as unknown as Response, next);
  return { json, next };
};

it('returns the token only to the requesting cashier', async () => {
  const { json, next } = await poll(0, 'cashier');
  expect(next).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({ id: approvalId, override_token: token }),
  });
});

it('rejects a different cashier without serializing any approval data', async () => {
  const { json, next } = await poll(1, 'cashier');
  expect(json).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

it('lets an administrator inspect status without exposing or erasing the owner token', async () => {
  const { json, next } = await poll(2, 'admin');
  expect(next).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledOnce();
  const response = json.mock.calls[0][0];
  expect(response.data).toMatchObject({ id: approvalId, status: 'approved' });
  expect(response.data).not.toHaveProperty('override_token');
  expect(JSON.stringify(response)).not.toContain(token);
  const stored = await query(`SELECT override_token FROM manager_approval_requests WHERE id = $1`, [
    approvalId,
  ]);
  expect(stored.rows[0].override_token).toBe(token);
});

it('returns not-found without data when the request does not exist', async () => {
  const { json, next } = await poll(0, 'cashier', -1);
  expect(json).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
});
