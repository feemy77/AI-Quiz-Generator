import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.your.app',     // Yeh apka apna hi rahega
  appName: 'Quiz Generator', // Yeh apka apna hi rahega
  webDir: 'out',
  server: {
    androidScheme: 'http',   // ✅ UPDATE: Yeh line add kar di gayi hai
    cleartext: true          // ✅ UPDATE: Yeh line add kar di gayi hai
  }
};

export default config;