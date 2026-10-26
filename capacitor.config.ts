import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fpnerd.tavla',
  appName: 'FP-Nerd Tavla',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#120c08',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#120c08',
      showSpinner: false,
    },
  },
};

export default config;
