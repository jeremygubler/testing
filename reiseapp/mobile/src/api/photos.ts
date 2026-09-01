import { File, UploadType } from 'expo-file-system';

import { absoluteUrl, apiErrorFrom, authHeaders, NetworkError, request, withSession } from './client';
import type { Photo, PhotoUploadResult } from './types';

export async function listPhotos(tripId: string): Promise<Photo[]> {
  return request<Photo[]>(`/trips/${tripId}/photos`);
}

export interface PhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  /** Client-read EXIF, used only as a hint – the server re-reads the original. */
  exif?: Record<string, unknown> | null;
}

function hintsFrom(asset: PhotoAsset): Record<string, string> {
  const exif = asset.exif ?? {};
  const hints: Record<string, string> = {};
  const lat = exif.GPSLatitude ?? exif['GPS:Latitude'];
  const lon = exif.GPSLongitude ?? exif['GPS:Longitude'];
  if (typeof lat === 'number' && typeof lon === 'number' && (lat !== 0 || lon !== 0)) {
    hints.lat = String(lat);
    hints.lon = String(lon);
  }
  return hints;
}

/**
 * Uploaded natively, not through fetch.
 *
 * Two reasons, and the first one is fatal: since SDK 54 Expo replaces the global
 * fetch with its own implementation, which builds the multipart body in
 * JavaScript and accepts only strings, Blobs and objects with bytes(). React
 * Native's classic `{ uri, name, type }` file part is not among them — it fails
 * with "Unsupported FormDataPart implementation" before the request ever leaves
 * the phone.
 *
 * The second reason is why this is the better answer rather than a workaround:
 * createUploadTask streams the file from disk. A JS-assembled body would pull
 * every original into memory first, and originals at full resolution are the
 * whole point of this app.
 */
export async function uploadPhoto(
  tripId: string,
  asset: PhotoAsset,
): Promise<PhotoUploadResult> {
  const url = absoluteUrl(`/trips/${tripId}/photos`);
  const file = new File(asset.uri);

  let result;
  try {
    result = await withSession((accessToken) =>
      file
        .createUploadTask(url, {
          uploadType: UploadType.MULTIPART,
          fieldName: 'file',
          mimeType: asset.mimeType ?? 'image/jpeg',
          parameters: hintsFrom(asset),
          headers: {
            Accept: 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        })
        .uploadAsync(),
    );
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (result.status >= 400) throw apiErrorFrom(result.status, result.body);
  return JSON.parse(result.body) as PhotoUploadResult;
}

/**
 * Only the fields actually passed are sent.
 *
 * A PATCH that always carries every key is not a patch: the server cannot tell
 * "leave the caption alone" from "clear the caption", and editing one field
 * silently wipes the other.
 */
export async function updatePhoto(
  tripId: string,
  photoId: string,
  data: { caption?: string | null; stopId?: string | null },
): Promise<Photo> {
  const body: Record<string, string | null> = {};
  if ('caption' in data) body.caption = data.caption ?? null;
  if ('stopId' in data) body.stop_id = data.stopId ?? null;

  return request<Photo>(`/trips/${tripId}/photos/${photoId}`, { method: 'PATCH', body });
}

export async function deletePhoto(tripId: string, photoId: string): Promise<void> {
  await request<void>(`/trips/${tripId}/photos/${photoId}`, { method: 'DELETE' });
}

/**
 * Image source for <Image>.
 *
 * The bytes go through the backend rather than a presigned object-store URL, so
 * the access token has to ride along as a header.
 */
export function photoSource(tripId: string, photoId: string, variant: 'original' | 'thumb') {
  return {
    uri: absoluteUrl(`/trips/${tripId}/photos/${photoId}/file?variant=${variant}`),
    headers: authHeaders(),
  };
}
