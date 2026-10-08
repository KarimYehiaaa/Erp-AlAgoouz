import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, disposePinia, getActivePinia } from 'pinia';

const { backupApi, authApi, replace } = vi.hoisted(() => ({
  backupApi: { restore: vi.fn(), restoreFile: vi.fn(), list: vi.fn() },
  authApi: { login: vi.fn(), profile: vi.fn(), logout: vi.fn() },
  replace: vi.fn(),
}));
vi.mock('@/api', () => ({ backup: backupApi, auth: authApi, users: {} }));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }));
import { useBackupSettings } from '../useBackupSettings';
import { useAuthStore } from '@/stores/auth';

describe('backup restoration session lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    authApi.login.mockResolvedValue({
      data: { user: { id: 1, role_name: 'admin' }, token: 'before-restore', permissions: [] },
    });
    await useAuthStore().login('fixture', 'fixture');
  });
  afterEach(() => {
    disposePinia(getActivePinia()!);
    vi.restoreAllMocks();
  });
  it.each(['stored', 'uploaded'])(
    'ends the current session after a successful %s restoration without a revoked follow-up request',
    async (source) => {
      backupApi.restore.mockResolvedValue({ data: { restored: 67 } });
      backupApi.restoreFile.mockResolvedValue({ data: { restored: 67 } });
      const backup = useBackupSettings();
      if (source === 'stored') await backup.restore('encrypted.json');
      else {
        backup.restoreFile.value = new File(['encrypted'], 'encrypted.json');
        await backup.uploadRestore();
      }
      expect(useAuthStore().isAuthenticated).toBe(false);
      expect(localStorage.getItem('user')).toBeNull();
      expect(replace).toHaveBeenCalledWith({ name: 'Login' });
      expect(backupApi.list).not.toHaveBeenCalled();
      expect(authApi.logout).not.toHaveBeenCalled();
    },
  );
  it('preserves the current session when restoration fails', async () => {
    backupApi.restore.mockRejectedValue(new Error('Invalid backup'));
    await useBackupSettings().restore('invalid.json');
    expect(useAuthStore().isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Invalid backup');
  });
});
