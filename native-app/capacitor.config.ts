import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pattayadinosaur.kingdom',
  appName: 'Pattaya Dinosaur Kingdom',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'pattaya-dinosaur-ticket-control.vercel.app',
      'pattaya-dinosaur-ticket-control-q6hxtsfgw-khant-min-htet2.vercel.app'
    ]
  },
  backgroundColor: '#041326',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};

export default config;
