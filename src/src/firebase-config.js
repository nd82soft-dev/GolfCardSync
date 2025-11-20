// Firebase configuration loaded from environment variables
// This file is processed by Vite and can access import.meta.env

export const getFirebaseConfig = () => {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
  };
  
  return config;
};

export const getAppId = () => {
  return import.meta.env.VITE_APP_ID || 'golfcardsync';
};

export const getInitialAuthToken = () => {
  return import.meta.env.VITE_INITIAL_AUTH_TOKEN || null;
};


