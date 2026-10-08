import { createApp, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useParticles } from '../useParticles';

describe('useParticles lifecycle', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let root: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    root?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    app = undefined;
    root = undefined;
  });

  it('exposes live activity state and cleans the animation and resize listener on unmount', () => {
    let particles: ReturnType<typeof useParticles> | undefined;
    app = createApp({
      setup() {
        particles = useParticles({ count: 0 });
        return () => h('div');
      },
    });
    root = document.createElement('div');
    app.mount(root);

    const api = particles!;
    const canvas = document.createElement('canvas');
    const parent = document.createElement('div');
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 180,
    } as DOMRect);
    parent.append(canvas);
    const context = { clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 41),
    );
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const removeListener = vi.spyOn(window, 'removeEventListener');

    api.init(canvas);
    expect(api.isActive.value).toBe(true);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(context.clearRect).toHaveBeenCalledOnce();

    app.unmount();

    expect(api.isActive.value).toBe(false);
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('does not activate or retain listeners when reduced motion is requested', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    let particles: ReturnType<typeof useParticles> | undefined;
    app = createApp({
      setup() {
        particles = useParticles({ count: 0 });
        return () => h('div');
      },
    });
    root = document.createElement('div');
    app.mount(root);
    const api = particles!;
    const canvas = document.createElement('canvas');
    const addListener = vi.spyOn(window, 'addEventListener');

    api.init(canvas);

    expect(api.isActive.value).toBe(false);
    expect(api.canvasRef.value).toBeNull();
    expect(addListener).not.toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
