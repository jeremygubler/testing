import { Directory, File, Paths } from 'expo-file-system';

import { exportFileName } from '@/sharing/share-state';
import { absoluteUrl, authHeaders, NetworkError } from './client';

export type ExportFormat = 'pdf' | 'gpx' | 'json';

export const EXPORT_LABEL: Record<ExportFormat, string> = {
  pdf: 'Reisebuch (PDF)',
  gpx: 'Route (GPX)',
  json: 'Alles (JSON)',
};

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  gpx: 'application/gpx+xml',
  json: 'application/json',
};

/** Keeps exports out of the documents directory: they are handed on, not kept. */
function exportDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Downloads an export and returns the local file.
 *
 * Streamed to disk by the native downloader rather than pulled through
 * JavaScript: a travel book with three hundred photos is tens of megabytes, and
 * the only thing that ever needs the bytes is the app the user shares it with.
 */
export async function downloadExport(
  tripId: string,
  title: string,
  format: ExportFormat,
): Promise<{ uri: string; mimeType: string }> {
  const target = new File(exportDirectory(), exportFileName(title, format));
  // A second export of the same trip replaces the first; keeping both would
  // silently fill the cache with copies nobody asked for.
  if (target.exists) target.delete();

  try {
    const file = await File.downloadFileAsync(
      absoluteUrl(`/trips/${tripId}/export.${format}`),
      target,
      { headers: { Accept: MIME[format], ...authHeaders() }, idempotent: true },
    );
    return { uri: file.uri, mimeType: MIME[format] };
  } catch (cause) {
    throw new NetworkError(cause);
  }
}
