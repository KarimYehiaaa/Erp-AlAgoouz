/**
 * composables/usePosAudio.ts — مؤثرات صوتية احترافية للكاشير بدون ملفات صوت خارجية
 * يستخدم Web Audio API لتوليد أصوات نقية وفورية
 */
export function usePosAudio() {
  const getAudioContext = () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    return AudioCtx ? new AudioCtx() : null;
  };

  /**
   * صوت بيب الباركود والمسح السريع (Beep)
   */
  const playScanBeep = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // Audio playback silently ignored if blocked by browser policy
    }
  };

  /**
   * صوت إتمام الدفع الناجح (Success Chime)
   */
  const playPaymentSuccess = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);

      // Note 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  /**
   * صوت التنبيه أو الخطأ (Error Buzz)
   */
  const playErrorBuzz = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  };

  return {
    playScanBeep,
    playPaymentSuccess,
    playErrorBuzz,
  };
}
