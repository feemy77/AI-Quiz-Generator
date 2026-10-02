import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aiquiz.generator',
  appName: 'Quiz Generator',
  webDir: 'out',
  server: {
    androidScheme: 'http',
    cleartext: true
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false
  }
};

export default config;