import type { Share } from '@/api/types';

/**
 * Whether a link still opens anything.
 *
 * The server keeps revoked and expired shares — they carry the view count, and
 * "this link was opened forty times before I pulled it" is worth knowing. The
 * list in the app is about what is live right now, so the filter belongs here
 * and not in a query.
 */
export function isLive(share: Share, now: Date = new Date()): boolean {
  if (share.revoked_at !== null) return false;
  return share.expires_at === null || new Date(share.expires_at) > now;
}

/** Filename for an export: recognisable in a downloads folder, safe on any disk. */
export function exportFileName(title: string, extension: string): string {
  const base = title.replace(/[^\p{L}\p{N} _-]/gu, '_').replace(/\s+/g, ' ').trim();
  // A title made only of separators survives the replacement as underscores,
  // which is a filename in form and none in fact.
  const named = /[\p{L}\p{N}]/u.test(base) ? base : '';
  return `${named || 'reise'}.${extension}`;
}
