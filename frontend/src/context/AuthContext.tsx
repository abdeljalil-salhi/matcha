import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, UNAUTHORIZED_EVENT, type Me } from "../api";

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  setUser: (user: Me | null) => void;
  patchUser: (patch: Partial<Me>) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<Me | null>(null);
  const requestSeq = useRef(0);

  const commitUser = useCallback((next: Me | null) => {
    userRef.current = next;
    setUserState(next);
  }, []);

  const setUser = useCallback(
    (next: Me | null) => {
      // Invalidate in-flight /me requests before applying an explicit change.
      requestSeq.current += 1;
      commitUser(next);
    },
    [commitUser],
  );

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const me = await api.profile.me();
      if (seq === requestSeq.current) commitUser(me);
      return me;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        if (seq === requestSeq.current) commitUser(null);
        return null;
      }
      // A transient failure must not sign a valid user out.
      return seq === requestSeq.current ? userRef.current : null;
    }
  }, [commitUser]);

  useEffect(() => {
    let active = true;
    void refresh().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [setUser]);

  const patchUser = useCallback(
    (patch: Partial<Me>) => {
      requestSeq.current += 1;
      setUserState((current) => {
        const next = current ? { ...current, ...patch } : current;
        userRef.current = next;
        return next;
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (cause) {
      // Keep the UI signed in if revoking the server session actually failed.
      if (!(cause instanceof ApiError && cause.status === 401)) throw cause;
    }
    setUser(null);
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, refresh, setUser, patchUser, signOut }),
    [user, loading, refresh, setUser, patchUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
