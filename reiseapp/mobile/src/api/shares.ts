import { API_BASE_URL } from '@/config';
import { request } from './client';
import type { Share, ShareCreated } from './types';

export async function listShares(tripId: string): Promise<Share[]> {
  return request<Share[]>(`/trips/${tripId}/shares`);
}

export async function createShare(
  tripId: string,
  input: { label?: string | null; expiresInDays?: number | null; includePhotos?: boolean },
): Promise<ShareCreated> {
  return request<ShareCreated>(`/trips/${tripId}/shares`, {
    method: 'POST',
    body: {
      label: input.label || null,
      expires_in_days: input.expiresInDays ?? null,
      include_photos: input.includePhotos ?? true,
    },
  });
}

export async function revokeShare(tripId: string, shareId: string): Promise<void> {
  await request<void>(`/trips/${tripId}/shares/${shareId}`, { method: 'DELETE' });
}

/**
 * The viewer lives on the API's own origin, so the link is the base URL plus
 * the path the server hands back — no second hostname to configure, and none to
 * get wrong.
 */
export function shareUrl(urlPath: string): string {
  return `${API_BASE_URL}${urlPath}`;
}
