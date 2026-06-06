import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { loadCurrentProfile, seedDefaultAccounts } from "../services/userAuth";
import AuthContext from "./authContext";

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
        try {
          await seedDefaultAccounts();
        } catch (bootstrapError) {
          console.warn("[bootstrap] Default admin setup:", bootstrapError);
        }
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        // Ensure Firestore requests include a fresh ID token (avoids permission-denied right after sign-in or tab restore).
        await firebaseUser.getIdToken(true);
        await refreshProfile(firebaseUser);
      } catch {
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
