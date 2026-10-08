import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import NotificationDrawer from '../NotificationDrawer.vue';

const fixture = vi.hoisted(() => ({
  app: null as any,
  auth: null as any,
  operations: { alerts: vi.fn(), notifications: vi.fn(), markAllNotificationsRead: vi.fn() },
}));
vi.mock('@/api', () => ({ operations: fixture.operations }));
vi.mock('@/stores/app', () => ({ useAppStore: () => fixture.app }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => fixture.auth }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
let wrapper: ReturnType<typeof mount>;
const saved = {
  id: 42,
  type: 'info',
  title_ar: 'Stored management report',
  message_ar: 'Report text',
  is_read: false,
};
const live = {
  type: 'stock_alert',
  severity: 'warning',
  title: 'Live stock warning',
  message: 'Stock needs attention',
  count: 1,
  items: [],
};
const open = async () => {
  wrapper = mount(NotificationDrawer, { global: { stubs: { AppIcon: true } } });
  await flushPromises();
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.app = reactive({
    notifications: [],
    notificationDrawerOpen: true,
    notificationContextRevision: 0,
    toggleNotificationDrawer: vi.fn(),
    addToast: vi.fn(),
  });
  fixture.auth = reactive({
    profileLoaded: true,
    user: { role_name: 'manager' },
    hasPermission: () => true,
  });
  fixture.operations.alerts.mockResolvedValue({ data: { alerts: [live] } });
  fixture.operations.notifications.mockResolvedValue({ data: [saved] });
});
afterEach(() => wrapper?.unmount());

describe('NotificationDrawer confirmed read state', () => {
  it('keeps a newly arrived notification when an earlier read-all confirmation resolves', async () => {
    let resolve!: (value: unknown) => void;
    fixture.operations.markAllNotificationsRead.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await open();
    await wrapper.find('.clear-all-link').trigger('click');
    const arrived = {
      notification_id: 43,
      title: 'Arrived after read-all started',
      severity: 'info',
      items: [],
    };
    fixture.app.notifications.push(arrived);
    resolve({ data: { success: true } });
    await flushPromises();
    expect(fixture.app.notifications).toEqual([live, arrived]);
  });
  it('does not restore stale unread rows from a refresh that began before read confirmation', async () => {
    await open();
    let resolve!: (value: unknown) => void;
    fixture.operations.notifications.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await wrapper.find('[title="تحديث التنبيهات"]').trigger('click');
    fixture.operations.markAllNotificationsRead.mockResolvedValue({ data: { success: true } });
    await wrapper.find('.clear-all-link').trigger('click');
    await flushPromises();
    resolve({ data: [saved] });
    await flushPromises();
    expect(fixture.app.notifications).toEqual([live]);
    expect(wrapper.find('[title="تحديث التنبيهات"]').attributes('disabled')).toBeUndefined();
  });
  it('does not populate the next account cache from a late notification fetch', async () => {
    let resolve!: (value: unknown) => void;
    fixture.operations.notifications.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await open();
    fixture.app.notificationContextRevision++;
    fixture.app.notifications = [];
    resolve({ data: [saved] });
    await flushPromises();
    expect(fixture.app.notifications).toEqual([]);
  });
  it('loads cashier personal notifications without requesting forbidden management alerts', async () => {
    fixture.auth.user.role_name = 'cashier';
    fixture.operations.alerts.mockRejectedValue({ response: { status: 403 } });
    await open();
    expect(fixture.operations.alerts).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(saved.title_ar);
    expect(fixture.app.notifications).toHaveLength(1);
  });
  it('shows personal notifications when the management alert provider is temporarily unavailable', async () => {
    fixture.operations.alerts.mockRejectedValue(new Error('fixture service unavailable'));
    await open();
    expect(wrapper.text()).toContain(saved.title_ar);
    expect(fixture.app.addToast).toHaveBeenCalledWith(expect.any(String), 'warning');
  });
  it('retains unread saved notifications when their refresh fails and reports the failure', async () => {
    fixture.operations.notifications.mockRejectedValue(new Error('fixture timeout'));
    fixture.app.notifications = [
      { notification_id: 42, title: saved.title_ar, severity: 'info', items: [] },
    ];
    await open();
    expect(wrapper.text()).toContain(saved.title_ar);
    expect(fixture.app.notifications).toHaveLength(2);
    expect(fixture.app.addToast).toHaveBeenCalledWith(expect.any(String), 'warning');
  });
  it('keeps unread notifications and reports a failed read-all request', async () => {
    fixture.operations.markAllNotificationsRead.mockRejectedValue(
      new Error('fixture network failure'),
    );
    await open();
    await wrapper.find('.clear-all-link').trigger('click');
    await flushPromises();
    expect(fixture.app.notifications).toHaveLength(2);
    expect(fixture.app.addToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(wrapper.text()).toContain(saved.title_ar);
  });
  it('removes only confirmed stored notifications and keeps active business alerts', async () => {
    fixture.operations.markAllNotificationsRead.mockResolvedValue({ data: { success: true } });
    await open();
    await wrapper.find('.clear-all-link').trigger('click');
    await flushPromises();
    expect(fixture.app.notifications).toEqual([live]);
    expect(wrapper.find('.clear-all-link').exists()).toBe(false);
  });
  it('disables repeated read-all while awaiting confirmation', async () => {
    let resolve!: (value: unknown) => void;
    fixture.operations.markAllNotificationsRead.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await open();
    await wrapper.find('.clear-all-link').trigger('click');
    expect(wrapper.find('.clear-all-link').attributes('disabled')).toBeDefined();
    await wrapper.find('.clear-all-link').trigger('click');
    expect(fixture.operations.markAllNotificationsRead).toHaveBeenCalledOnce();
    resolve({ data: { success: true } });
    await flushPromises();
  });
  it('does not apply an old read confirmation to the next account notifications', async () => {
    let resolve!: (value: unknown) => void;
    fixture.operations.markAllNotificationsRead.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await open();
    await wrapper.find('.clear-all-link').trigger('click');
    fixture.app.notificationContextRevision++;
    const nextAccount = { notification_id: 99, title: 'Next account private notice' };
    fixture.app.notifications = [nextAccount];
    resolve({ data: { success: true } });
    await flushPromises();
    expect(fixture.app.notifications).toEqual([nextAccount]);
  });
});
