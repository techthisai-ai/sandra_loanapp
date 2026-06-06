import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

/** Firebase project: cafe-c396e — enable Auth, Firestore, and Hosting in the Firebase Console. */
export const firebaseConfig = {
  apiKey: "AIzaSyAMQ9SGIh1AkzDs98LlWQ89IA4oaqyqF5M",
  authDomain: "cafe-c396e.firebaseapp.com",
  projectId: "cafe-c396e",
  storageBucket: "cafe-c396e.firebasestorage.app",
  messagingSenderId: "234698735926",
  appId: "1:234698735926:web:01a2a0c27f79c873f93397",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
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
