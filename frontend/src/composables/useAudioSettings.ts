import { ref } from 'vue';

/**
 * إعدادات الصوتيات والاختصارات السريعة المحفوظة محليًا في المتصفح (localStorage).
 * لا تعتمد على الخادم إطلاقًا — تُقرأ عند التحميل وتُحفظ فورًا بزر واحد.
 */
export function useAudioSettings() {
  const soundEnabled = ref(localStorage.getItem('sound_enabled') !== 'false');
  const soundVolume = ref(parseFloat(localStorage.getItem('sound_volume') || '0.08'));
  const shortcutsEnabled = ref(localStorage.getItem('shortcuts_enabled') !== 'false');

  /** حفظ الإعدادات الثلاثة في localStorage مع رسالة تأكيد. */
  const saveSettingsLocally = () => {
    localStorage.setItem('sound_enabled', String(soundEnabled.value));
    localStorage.setItem('sound_volume', String(soundVolume.value));
    localStorage.setItem('shortcuts_enabled', String(shortcutsEnabled.value));
    alert('✓ تم حفظ إعدادات النظام بنجاح!');
  };

  /**
   * تشغيل نغمة تجريبية عبر Web Audio API حسب النوع:
   * success = نغمتان متوافقتان، warning = مثلث 220Hz، error = ثلاث نغمات متتالية.
   */
  const playTestBeep = (type: any) => {
    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (type === 'success') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gain.gain.setValueAtTime(soundVolume.value, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.25);
        osc2.stop(audioCtx.currentTime + 0.25);
      } else if (type === 'warning') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(soundVolume.value * 1.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else if (type === 'error') {
        const gain = audioCtx.createGain();
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(soundVolume.value * 2, audioCtx.currentTime);
        const playTone = (freq: any, duration: any, delay: any) => {
          const osc = audioCtx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          osc.connect(gain);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + duration);
        };
        playTone(130, 0.1, 0);
        playTone(130, 0.1, 0.12);
        playTone(130, 0.15, 0.24);
      }
    } catch (err: any) {
      console.error('Audio play failed:', err);
    }
  };

  return { soundEnabled, soundVolume, shortcutsEnabled, saveSettingsLocally, playTestBeep };
}
