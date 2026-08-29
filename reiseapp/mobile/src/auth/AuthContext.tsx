import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '@/api/auth';
import { onSessionChange, restoreSession } from '@/api/client';
import type { User } from '@/api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    // A refresh token that turned out to be dead clears the session from inside
    // the API client; the UI has to follow without being asked.
    const unsubscribe = onSessionChange((tokens) => {
      if (tokens === null && !cancelled) {
        setUser(null);
        setStatus('signedOut');
      }
    });

    void (async () => {
      const tokens = await restoreSession();
      if (cancelled) return;
      if (!tokens) {
        setStatus('signedOut');
        return;
      }
      try {
        const profile = await authApi.me();
        if (cancelled) return;
        setUser(profile);
        setStatus('signedIn');
      } catch {
        if (!cancelled) setStatus('signedOut');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const profile = await authApi.login(email, password);
    setUser(profile);
    setStatus('signedIn');
  }, []);

  const signUp = useCallback<AuthState['signUp']>(async (input) => {
    await authApi.register(input);
    const profile = await authApi.login(input.email, input.password);
    setUser(profile);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
