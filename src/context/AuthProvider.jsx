import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { loadCurrentProfile, seedDefaultAccounts } from "../services/userAuth";
import AuthContext from "./authContext";

const AUTH_INIT_TIMEOUT_MS = 25_000;

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
  const profileUidRef = useRef(null);

  const refreshProfile = async (targetUser = auth.currentUser) => {
    if (!targetUser) {
      setProfile(null);
      profileUidRef.current = null;
      return null;
    }

    try {
      const currentProfile = await loadCurrentProfile(targetUser);
      if (currentProfile) {
        setProfile(currentProfile);
        profileUidRef.current = targetUser.uid;
        return currentProfile;
      }

      if (profileUidRef.current !== targetUser.uid) {
        setProfile(null);
      }
      return null;
    } catch (profileError) {
      if (profileUidRef.current !== targetUser.uid) {
        setProfile(null);
      }
      throw profileError;
    }
  };

  const setProfileFromLogin = (nextProfile, uid) => {
    if (!nextProfile || !uid) return;
    setProfile(nextProfile);
    profileUidRef.current = uid;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        profileUidRef.current = null;
        setLoading(false);
        void seedDefaultAccounts().catch((bootstrapError) => {
          console.warn("[bootstrap] Default admin setup:", bootstrapError);
        });
        return;
      }

      try {
        await withTimeout(firebaseUser.getIdToken(), AUTH_INIT_TIMEOUT_MS, "Auth session");
        await withTimeout(refreshProfile(firebaseUser), AUTH_INIT_TIMEOUT_MS, "Profile load");
      } catch (initError) {
        console.warn("[auth] session init:", initError?.message || initError);
        setProfile((previous) => {
          if (previous && profileUidRef.current === firebaseUser.uid) {
            return previous;
          }
          return null;
        });
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
          const nextProfile = snapshot.data();
          setProfile(nextProfile);
          profileUidRef.current = user.uid;
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
      setProfileFromLogin,
      refreshProfile,
      loading,
      isAuthenticated: Boolean(user && profile),
      role: profile?.role ?? null,
    }),
    [loading, profile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
