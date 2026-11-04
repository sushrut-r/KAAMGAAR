import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.kaamgaar.in',
  appName: 'कामगार',
  webDir: 'dist',
  // Android WebView mein HTTPS scheme use karo (modern approach)
  server: {
    androidScheme: 'https',
    // Development mein live reload ke liye — production build mein ye hata dena
    // url: 'http://YOUR_LOCAL_IP:5173',
    // cleartext: true,
  },
  android: {
    // Minimum API level 22 (Android 5.1+) — India mein sab phone cover
    minWebViewVersion: 60,
    backgroundColor: '#faf6f0',
    // Splash screen background
    splashScreenBackgroundColor: '#faf6f0',
  },
  plugins: {
    // SplashScreen plugin config
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#faf6f0',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    // StatusBar dark text on light background
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#faf6f0',
    },
    // Preferences (secure local storage for tokens)
    Preferences: {
      group: 'KaamgaarStore',
    },
  },
};

export default config;
