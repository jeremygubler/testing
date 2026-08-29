import { clearSession, currentTokens, request, setSession } from './client';
import type { TokenPair, User } from './types';

export async function login(email: string, password: string): Promise<User> {
  const pair = await request<TokenPair>('/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
  await setSession(pair);
  return me();
}

export async function register(input: {
  email: string;
  displayName: string;
  password: string;
  inviteCode?: string;
}): Promise<User> {
  return request<User>('/auth/register', {
    method: 'POST',
    anonymous: true,
    body: {
      email: input.email,
      display_name: input.displayName,
      password: input.password,
      invite_code: input.inviteCode?.trim() || null,
    },
  });
}

export async function me(): Promise<User> {
  return request<User>('/auth/me');
}

export async function logout(): Promise<void> {
  const refreshToken = currentTokens()?.refreshToken;
  if (refreshToken) {
    // Best effort: a failed logout must not trap the user in a signed-in state.
    await request('/auth/logout', {
      method: 'POST',
      anonymous: true,
      body: { refresh_token: refreshToken },
    }).catch(() => undefined);
  }
  await clearSession();
}
