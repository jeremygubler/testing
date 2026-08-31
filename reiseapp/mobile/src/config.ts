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

/**
 * MapLibre style URL.
 *
 * OpenFreeMap: no API key, no registration, no rate limit in the small print,
 * and the tiles are published as a dataset, so the same style can later be
 * served from the homelab. The previous default, MapLibre's demotiles, carries
 * nothing but country outlines — at world zoom it passes for a map, over a
 * village it is a coloured rectangle, which is exactly how it was found.
 *
 * Override with EXPO_PUBLIC_MAP_STYLE_URL to point at a tileserver-gl in the
 * homelab and keep the map self-hosted too.
 *
 * The default belongs here and not in app.json's `extra`: expo-constants
 * serialises that file into the APK during the Gradle build, so a value there
 * can only be changed by rebuilding — while this one travels with an ordinary
 * Metro reload. extra.mapStyleUrl is still honoured for anyone who sets it.
 */
export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ??
  (Constants.expoConfig?.extra as { mapStyleUrl?: string } | undefined)?.mapStyleUrl ??
  'https://tiles.openfreemap.org/styles/liberty';
