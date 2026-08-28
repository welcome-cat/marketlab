/**
 * Firebase Configuration
 * 실제 Firebase 프로젝트 (marketlab-731e3) 연결
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDTkmOG4VPpNeLKTZebY9Mjubu8Cjvtk0A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "marketlab-731e3.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "marketlab-731e3",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "marketlab-731e3.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "800334830892",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:800334830892:web:a3169f9e364b3deb1a2715",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 학교/교육청 네트워크 방화벽 및 브라우저 gRPC 차단을 방지하기 위해 롱폴링 안정화 모드 적용
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export default app;
