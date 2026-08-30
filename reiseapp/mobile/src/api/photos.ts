import { absoluteUrl, authHeaders, request } from './client';
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

export async function uploadPhoto(
  tripId: string,
  asset: PhotoAsset,
): Promise<PhotoUploadResult> {
  const form = new FormData();
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg';
  // React Native's FormData takes this shape for files; it is not a web Blob.
  form.append('file', {
    uri: asset.uri,
    name,
    type: asset.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  for (const [key, value] of Object.entries(hintsFrom(asset))) form.append(key, value);

  return request<PhotoUploadResult>(`/trips/${tripId}/photos`, {
    method: 'POST',
    body: form,
  });
}

export async function updatePhoto(
  tripId: string,
  photoId: string,
  data: { caption?: string | null; stopId?: string | null },
): Promise<Photo> {
  return request<Photo>(`/trips/${tripId}/photos/${photoId}`, {
    method: 'PATCH',
    body: { caption: data.caption ?? null, stop_id: data.stopId ?? null },
  });
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
