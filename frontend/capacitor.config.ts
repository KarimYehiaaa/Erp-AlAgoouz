import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV === 'development';

const config: CapacitorConfig = {
  appId: 'com.binalagoouz.manager',
  appName: 'بن العجوز - تقارير الإدارة',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: isDev,
    allowNavigation: isDev
      ? ['localhost', '127.0.0.1', '192.168.*', '10.0.*']
      : ['agoouz.vercel.app', 'agoouz-api.vercel.app'],
  },
  plugins: {
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
