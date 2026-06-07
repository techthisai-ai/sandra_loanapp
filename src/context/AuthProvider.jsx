import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { loadCurrentProfile, seedDefaultAccounts } from "../services/userAuth";
import AuthContext from "./authContext";

const AUTH_INIT_TIMEOUT_MS = 12_000;

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (targetUser = auth.currentUser) => {
    if (!targetUser) {
      setProfile(null);
      return null;
    }

    const currentProfile = await loadCurrentProfile(targetUser);
    setProfile(currentProfile);
    return currentProfile;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        void seedDefaultAccounts().catch((bootstrapError) => {
          console.warn("[bootstrap] Default admin setup:", bootstrapError);
        });
        return;
      }

      try {
        // Ensure Firestore requests include a fresh ID token (avoids permission-denied right after sign-in or tab restore).
        await withTimeout(firebaseUser.getIdToken(true), AUTH_INIT_TIMEOUT_MS, "Auth session");
        await withTimeout(refreshProfile(firebaseUser), AUTH_INIT_TIMEOUT_MS, "Profile load");
      } catch (initError) {
        console.warn("[auth] session init:", initError?.message || initError);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.data());
        }
      },
      (listenerError) => {
        console.warn("[auth] profile listener:", listenerError?.message || listenerError);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const value = useMemo(
    () => ({
      user,
      profile,
      setProfile,
      refreshProfile,
      loading,
      isAuthenticated: Boolean(user && profile),
      role: profile?.role ?? null,
    }),
    [loading, profile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
