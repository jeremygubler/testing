import type { Photo } from '@/api/types';

/** A photo that knows where it was taken. */
export type PlacedPhoto = Photo & { lat: number; lon: number };

/**
 * Photos that can be drawn on a map.
 *
 * The null check is explicit rather than truthy on purpose: latitude 0 is the
 * equator and longitude 0 runs through Greenwich, and a falsy test would throw
 * both away along with everything on them.
 */
export function placedPhotos(photos: Photo[]): PlacedPhoto[] {
  return photos.filter(
    (photo): photo is PlacedPhoto => photo.lat !== null && photo.lon !== null,
  );
}
