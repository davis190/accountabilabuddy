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
import {
  beginGoogleSignIn,
  clearTokens,
  cognitoLogoutUrl,
  getValidAccessToken,
  isCognitoConfigured,
  loadTokens,
  type CognitoTokens,
} from './lib/cognito';

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
  cognitoEnabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDev: (name?: string) => Promise<void>;
  completeOAuthSignIn: (accessToken: string) => Promise<void>;
  signOut: () => void;
  refreshMe: () => Promise<void>;
  setActiveGroupId: (groupId: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const DEV_STORAGE_KEY = 'ab.auth.dev';
const GROUP_KEY = 'ab.activeGroup';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(
    () => localStorage.getItem(GROUP_KEY),
  );
  const cognitoEnabled = isCognitoConfigured();

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

  const applyAccessToken = useCallback(async (accessToken: string) => {
    setAuthHeader(`Bearer ${accessToken}`);
    await refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    void (async () => {
      try {
        if (cognitoEnabled) {
          const token = await getValidAccessToken();
          if (token) {
            await applyAccessToken(token);
          }
        } else {
          const saved = localStorage.getItem(DEV_STORAGE_KEY);
          if (saved) {
            setAuthHeader(saved);
            await refreshMe();
          }
        }
      } catch {
        clearTokens();
        localStorage.removeItem(DEV_STORAGE_KEY);
        setAuthHeader(null);
        setUser(null);
      } finally {
        setReady(true);
      }
    })();
  }, [applyAccessToken, cognitoEnabled, refreshMe]);

  const signInWithGoogle = useCallback(async () => {
    await beginGoogleSignIn();
  }, []);

  const completeOAuthSignIn = useCallback(
    async (accessToken: string) => {
      await applyAccessToken(accessToken);
    },
    [applyAccessToken],
  );

  const signInDev = useCallback(
    async (name = 'Dev User') => {
      if (cognitoEnabled) {
        throw new Error('Dev sign-in is disabled when Cognito is configured');
      }
      const userId = `user_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const header = `Bearer dev:${userId}|${userId}@example.com|${name}`;
      localStorage.setItem(DEV_STORAGE_KEY, header);
      setAuthHeader(header);
      await refreshMe();
    },
    [cognitoEnabled, refreshMe],
  );

  const signOut = useCallback(() => {
    const hadCognito = Boolean(loadTokens());
    clearTokens();
    localStorage.removeItem(DEV_STORAGE_KEY);
    setAuthHeader(null);
    setUser(null);
    setMemberships([]);
    if (hadCognito && cognitoEnabled) {
      window.location.assign(cognitoLogoutUrl());
    }
  }, [cognitoEnabled]);

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
      cognitoEnabled,
      signInWithGoogle,
      signInDev,
      completeOAuthSignIn,
      signOut,
      refreshMe,
      setActiveGroupId,
    }),
    [
      ready,
      user,
      memberships,
      activeGroupId,
      cognitoEnabled,
      signInWithGoogle,
      signInDev,
      completeOAuthSignIn,
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

export type { CognitoTokens };
