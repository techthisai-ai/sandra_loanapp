import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { loadCurrentProfile, seedDefaultAccounts } from "../services/userAuth";
import { isNativeApp } from "../utils/authSession";
import AuthContext from "./authContext";

const AUTH_INIT_TIMEOUT_MS = 25_000;
const LOGIN_PROFILE_LOCK_MS = 120_000;

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
  const loginProfileLockRef = useRef(null);
  const authInitGenerationRef = useRef(0);

  const getLockedLoginProfile = (uid) => {
    const lock = loginProfileLockRef.current;
    if (!lock || lock.uid !== uid) return null;
    if (Date.now() - lock.at > LOGIN_PROFILE_LOCK_MS) return null;
    return lock.profile;
  };

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

      const lockedProfile = getLockedLoginProfile(targetUser.uid);
      if (lockedProfile) {
        setProfile(lockedProfile);
        profileUidRef.current = targetUser.uid;
        return lockedProfile;
      }

      if (profileUidRef.current !== targetUser.uid) {
        setProfile(null);
      }
      return null;
    } catch (profileError) {
      const lockedProfile = getLockedLoginProfile(targetUser.uid);
      if (lockedProfile) {
        setProfile(lockedProfile);
        profileUidRef.current = targetUser.uid;
        return lockedProfile;
      }

      if (profileUidRef.current !== targetUser.uid) {
        setProfile(null);
      }
      throw profileError;
    }
  };

  const setProfileFromLogin = (nextProfile, uid) => {
    if (!nextProfile || !uid) return;
    loginProfileLockRef.current = { uid, profile: nextProfile, at: Date.now() };
    setProfile(nextProfile);
    profileUidRef.current = uid;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const initGeneration = ++authInitGenerationRef.current;
      setUser(firebaseUser);

      if (!firebaseUser) {
        loginProfileLockRef.current = null;
        setProfile(null);
        profileUidRef.current = null;
        setLoading(false);
        if (!isNativeApp()) {
          void seedDefaultAccounts().catch((bootstrapError) => {
            console.warn("[bootstrap] Default admin setup:", bootstrapError);
          });
        }
        return;
      }

      try {
        await withTimeout(firebaseUser.getIdToken(), AUTH_INIT_TIMEOUT_MS, "Auth session");
        if (initGeneration !== authInitGenerationRef.current) return;
        await withTimeout(refreshProfile(firebaseUser), AUTH_INIT_TIMEOUT_MS, "Profile load");
      } catch (initError) {
        console.warn("[auth] session init:", initError?.message || initError);
        setProfile((previous) => {
          const lockedProfile = getLockedLoginProfile(firebaseUser.uid);
          if (lockedProfile) return lockedProfile;
          if (previous && profileUidRef.current === firebaseUser.uid) {
            return previous;
          }
          return null;
        });
      } finally {
        if (initGeneration === authInitGenerationRef.current) {
          setLoading(false);
        }
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
