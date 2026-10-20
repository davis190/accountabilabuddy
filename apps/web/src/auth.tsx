import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAuthHeader } from './api';

export interface MeUser {
  userId: string;
  email: string;
  displayName: string;
  timezone: string;
}

export interface MembershipSummary {
  groupId: string;
  name: string;
  role: string;
  weeklyPointTarget: number;
  lastUsedAt?: string;
}

interface AuthState {
  ready: boolean;
  user: MeUser | null;
  memberships: MembershipSummary[];
  activeGroupId: string | null;
  signInDev: (name?: string) => Promise<void>;
  signOut: () => void;
  refreshMe: () => Promise<void>;
  setActiveGroupId: (groupId: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'ab.auth';
const GROUP_KEY = 'ab.activeGroup';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(
    () => localStorage.getItem(GROUP_KEY),
  );

  const refreshMe = useCallback(async () => {
    const data = await api<{
      user: MeUser;
      memberships: MembershipSummary[];
    }>('/v1/me');
    setUser(data.user);
    setMemberships(data.memberships);
    if (!activeGroupId && data.memberships[0]) {
      setActiveGroupIdState(data.memberships[0].groupId);
      localStorage.setItem(GROUP_KEY, data.memberships[0].groupId);
    }
  }, [activeGroupId]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setAuthHeader(saved);
      refreshMe()
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          setAuthHeader(null);
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [refreshMe]);

  const signInDev = useCallback(
    async (name = 'Dev User') => {
      const userId = `user_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const header = `Bearer dev:${userId}|${userId}@example.com|${name}`;
      localStorage.setItem(STORAGE_KEY, header);
      setAuthHeader(header);
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthHeader(null);
    setUser(null);
    setMemberships([]);
  }, []);

  const setActiveGroupId = useCallback((groupId: string) => {
    setActiveGroupIdState(groupId);
    localStorage.setItem(GROUP_KEY, groupId);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      memberships,
      activeGroupId,
      signInDev,
      signOut,
      refreshMe,
      setActiveGroupId,
    }),
    [
      ready,
      user,
      memberships,
      activeGroupId,
      signInDev,
      signOut,
      refreshMe,
      setActiveGroupId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
