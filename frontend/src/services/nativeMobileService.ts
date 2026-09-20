import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';

export const isNativeMobile = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const initNativeMobile = async (): Promise<void> => {
  if (!isNativeMobile()) return;

  try {
    // 1. Configure Status Bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0e0a07' });
    await StatusBar.setOverlaysWebView({ overlay: false });

    // 2. Auto-hide Splash Screen after assets load
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[NativeMobile] Error initializing native features:', err);
  }
};

/**
 * Haptic Vibration Feedback
 */
export const triggerHaptic = async (
  type: 'success' | 'warning' | 'error' | 'light' | 'medium',
): Promise<void> => {
  if (!isNativeMobile()) return;

  try {
    switch (type) {
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
    }
  } catch {
    // Haptics are optional on unsupported devices.
  }
};

/**
 * Biometric / App Security Preferences
 */
export const getBiometricsEnabled = async (): Promise<boolean> => {
  try {
    const { value } = await Preferences.get({ key: 'binalagoouz_biometrics_enabled' });
    return value === 'true';
  } catch {
    return false;
  }
};

export const setBiometricsEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await Preferences.set({
      key: 'binalagoouz_biometrics_enabled',
      value: enabled ? 'true' : 'false',
    });
  } catch {
    // Preferences are best-effort and must not block the application.
  }
};

export default {
  isNativeMobile,
  initNativeMobile,
  triggerHaptic,
  getBiometricsEnabled,
  setBiometricsEnabled,
};
