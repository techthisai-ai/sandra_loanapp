import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

/** Firebase project: sandraloanapp-85985 — enable Auth, Firestore, and Hosting in the Firebase Console. */
export const firebaseConfig = {
  apiKey: "AIzaSyDwQJ8-9Ttp3xJ9Tr7Yruj0iVFfFP99ymE",
  authDomain: "sandraloanapp-85985.firebaseapp.com",
  projectId: "sandraloanapp-85985",
  storageBucket: "sandraloanapp-85985.firebasestorage.app",
  messagingSenderId: "930341187943",
  appId: "1:930341187943:web:0efc3126570f197e57ffc2",
  measurementId: "G-BDXCN9KNP9",
};

const app = initializeApp(firebaseConfig);

function createFirebaseAuth() {
  if (!Capacitor.isNativePlatform()) {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.includes("already exists")) {
      return getAuth(app);
    }
    throw error;
  }
}

export const auth = createFirebaseAuth();
export const db = getFirestore(app);

function initAnalytics() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!firebaseConfig.measurementId) {
    return null;
  }
  try {
    return getAnalytics(app);
  } catch {
    return null;
  }
}

export const analytics = initAnalytics();
export default app;
