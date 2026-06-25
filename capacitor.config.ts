import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.visby.app',
  appName: 'Visby',
  webDir: 'mobile/www',
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://app.visby.me',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: false,
      backgroundColor: '#0d0f14',
    },
    StatusBar: {
      style: 'Default',
    },
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
