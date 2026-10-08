import { afterEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('../src/database/pool.ts', () => ({
  query: queryMock,
  withTransaction: vi.fn(),
}));
vi.mock('../src/database/maintenanceBarrier.ts', () => ({
  runSharedMaintenanceTask: vi.fn((task: () => unknown) => task()),
}));
vi.mock('../src/services/notificationService.ts', () => ({
  sendAlert: vi.fn(),
}));
vi.mock('../src/services/workflowGraphService.ts', () => ({
  default: { runAutomationNow: vi.fn() },
}));

import {
  initAutomationScheduler,
  stopAutomationScheduler,
} from '../src/services/automationSchedulerService.ts';
import { initDatabaseMaintenanceScheduler } from '../src/services/maintenanceService.ts';

describe('scheduled services in test mode', () => {
  afterEach(() => {
    stopAutomationScheduler();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not start automation polling or execute an initial tick', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const interval = vi.spyOn(globalThis, 'setInterval');

    expect(initAutomationScheduler()).toBeNull();
    expect(interval).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not schedule database maintenance', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const interval = vi.spyOn(globalThis, 'setInterval');

    initDatabaseMaintenanceScheduler();

    expect(interval).not.toHaveBeenCalled();
  });

  it('does not start recurring jobs in Vercel serverless instances', () => {
    vi.stubEnv('VERCEL', '1');
    const interval = vi.spyOn(globalThis, 'setInterval');

    expect(initAutomationScheduler()).toBeNull();
    expect(initDatabaseMaintenanceScheduler()).toBeNull();
    expect(interval).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
