import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.binalagoouz.manager',
  appName: 'بن العجوز - تقارير الإدارة',
  webDir: 'dist-native',
  server: {
    androidScheme: 'https',
    cleartext: false,
    // API requests do not require permission to navigate remote pages inside the native bridge.
    allowNavigation: [],
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090604',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#090604',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
