import { createApp, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStaggeredEntrance } from '../useLoginAnimations';

describe('useStaggeredEntrance lifecycle', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let root: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    root?.remove();
    vi.useRealTimers();
    app = undefined;
    root = undefined;
  });

  it('cancels pending entrance timers when the component unmounts', () => {
    vi.useFakeTimers();
    let visibleItems: ReturnType<typeof useStaggeredEntrance>['visibleItems'] | undefined;
    app = createApp({
      setup() {
        ({ visibleItems } = useStaggeredEntrance(3, 10));
        return () => h('div');
      },
    });
    root = document.createElement('div');
    app.mount(root);

    expect(visibleItems?.value).toEqual([false, false, false]);
    expect(vi.getTimerCount()).toBe(3);

    app.unmount();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(100);
    expect(visibleItems?.value).toEqual([false, false, false]);
  });
});
