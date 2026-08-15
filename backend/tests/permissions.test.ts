import { describe, it, expect } from 'vitest';
import {
  ADMIN_ROLES,
  permissionEquivalents,
  expandPermissionCodes,
  satisfiesPermission,
} from '../../shared/permissions.js';

describe('shared permission equivalents', () => {
  it('every code in the map is satisfied by itself (direct match wins)', () => {
    for (const code of Object.keys(permissionEquivalents)) {
      expect(satisfiesPermission([code], code), `${code} must satisfy itself`).toBe(true);
      expect(expandPermissionCodes([code]), `${code} must be kept in its own expansion`).toContain(code);
    }
  });

  it('expands sales.view to pos.view / sales.view / reports.view', () => {
    expect(expandPermissionCodes(['sales.view'])).toEqual([
      'sales.view',
      'pos.view',
      'reports.view',
    ]);
  });

  it('keeps codes without equivalents as exact match', () => {
    expect(expandPermissionCodes(['dashboard.view'])).toEqual(['dashboard.view']);
    expect(expandPermissionCodes(['nope.xyz'])).toEqual(['nope.xyz']);
  });

  it('merges equivalents across multiple requested codes', () => {
    expect(expandPermissionCodes(['sales.add', 'products.view']).sort()).toEqual(
      ['sales.add', 'pos.add', 'invoices.add', 'products.view'].sort(),
    );
  });

  it('satisfies aggregate UI codes from granular server codes', () => {
    expect(satisfiesPermission(['settings.edit'], 'settings.manage')).toBe(true);
    expect(satisfiesPermission(['products.view'], 'products.manage')).toBe(true);
    expect(satisfiesPermission(['inventory.view'], 'inventory.manage')).toBe(true);
    expect(satisfiesPermission(['hr.delete'], 'hr.manage')).toBe(true);
    expect(satisfiesPermission(['users.view'], 'users.manage')).toBe(true);
  });

  it('preserves legacy frontend-only codes', () => {
    expect(satisfiesPermission(['pos.view'], 'sales.branch')).toBe(true);
    expect(satisfiesPermission(['pos.view'], 'sales.pos')).toBe(true);
    expect(satisfiesPermission(['sales.delete'], 'sales.return')).toBe(true);
    expect(satisfiesPermission(['products.view'], 'recipes.view')).toBe(true);
    expect(satisfiesPermission(['inventory.view'], 'purchases.view')).toBe(true);
  });

  it('keeps reports.view strict (server value wins over the old frontend map)', () => {
    expect(satisfiesPermission(['reports.add'], 'reports.view')).toBe(false);
    expect(satisfiesPermission(['reports.view'], 'reports.view')).toBe(true);
  });

  it('rejects unrelated permissions', () => {
    expect(satisfiesPermission(['inventory.view'], 'sales.add')).toBe(false);
    expect(satisfiesPermission(['pos.view'], 'settings.manage')).toBe(false);
    expect(satisfiesPermission(['dashboard.view'], 'products.manage')).toBe(false);
    expect(satisfiesPermission([], 'anything.at.all')).toBe(false);
  });

  it('defines the admin roles used by both backend and frontend', () => {
    expect(ADMIN_ROLES).toEqual(['admin', 'sys_admin', 'owner']);
  });
});
