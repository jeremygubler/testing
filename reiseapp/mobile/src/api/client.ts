import { API_BASE_URL, API_PREFIX } from '@/config';
import { clearTokens, loadTokens, saveTokens, type StoredTokens } from '@/auth/tokens';
import type { ApiErrorBody, TokenPair } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(status: number, type: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
  }
}

/** Network failure, DNS, wrong host – anything that never reached the backend. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Server nicht erreichbar');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Objects are sent as JSON; a FormData body is passed through untouched. */
  body?: unknown;
  /** Set for the auth endpoints, which must not carry (or refresh) a token. */
  anonymous?: boolean;
}

type SessionListener = (tokens: StoredTokens | null) => void;

let tokens: StoredTokens | null = null;
let refreshInFlight: Promise<StoredTokens | null> | null = null;
const listeners = new Set<SessionListener>();

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(next: StoredTokens | null): void {
  tokens = next;
  listeners.forEach((listener) => listener(next));
}

export async function restoreSession(): Promise<StoredTokens | null> {
  const stored = await loadTokens();
  emit(stored);
  return stored;
}

export async function setSession(pair: TokenPair): Promise<void> {
  const next = { accessToken: pair.access_token, refreshToken: pair.refresh_token };
  await saveTokens(next);
  emit(next);
}

export async function clearSession(): Promise<void> {
  await clearTokens();
  emit(null);
}

export function currentTokens(): StoredTokens | null {
  return tokens;
}

/** Headers for resources fetched outside of `request`, e.g. <Image> sources. */
export function authHeaders(): Record<string, string> {
  const accessToken = tokens?.accessToken;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function absoluteUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.error.type, body.error.message);
  } catch {
    return new ApiError(response.status, 'http_error', `HTTP ${response.status}`);
  }
}

function encodeBody(body: unknown): { body: BodyInit | undefined; contentType?: string } {
  if (body === undefined) return { body: undefined };
  // Never set Content-Type for FormData: the runtime has to add the multipart
  // boundary, and an explicit header silently breaks the upload.
  if (body instanceof FormData) return { body };
  return { body: JSON.stringify(body), contentType: 'application/json' };
}

async function send(path: string, options: RequestOptions, accessToken?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const encoded = encodeBody(options.body);
  if (encoded.contentType) headers['Content-Type'] = encoded.contentType;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    return await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: encoded.body,
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

/**
 * Exchange the refresh token, at most once concurrently.
 *
 * Single-flight matters here: the backend rotates refresh tokens and treats a
 * replayed one as a leak by killing every session. Two screens refreshing in
 * parallel would log the user out for good.
 */
async function refreshSession(): Promise<StoredTokens | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = tokens?.refreshToken;
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    const response = await send('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      anonymous: true,
    });
    if (!response.ok) {
      await clearSession();
      return null;
    }
    const pair = (await response.json()) as TokenPair;
    await setSession(pair);
    return currentTokens();
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options, options.anonymous ? undefined : tokens?.accessToken);

  if (response.status === 401 && !options.anonymous && tokens?.refreshToken) {
    const refreshed = await refreshSession();
    if (!refreshed) throw await parseError(response);
    response = await send(path, options, refreshed.accessToken);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
