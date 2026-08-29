import Constants from 'expo-constants';

/**
 * Base URL of the self-hosted backend.
 *
 * Order: EXPO_PUBLIC_API_URL (per-developer, not checked in) wins over the value
 * baked into app.json. On a physical device `localhost` is the phone itself, so
 * this has to be the LAN or reverse-proxy address of the homelab.
 */
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  fromExtra ??
  'http://localhost:8000'
).replace(/\/+$/, '');

export const API_PREFIX = '/api/v1';
