import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** `undefined` while asking, `null` when the phone has no idea. */
export type DeviceCenter = [number, number] | null | undefined;

/**
 * Where to open a map that has nothing of its own to show.
 *
 * The honest answers are "where you are" and "the whole world" — never a city
 * picked by whoever wrote the file. A hard-coded centre is not a neutral
 * default: it invites a long-press onto a blank map and produces a stop 47 km
 * from anywhere the user has been, which is exactly what happened.
 *
 * getLastKnownPositionAsync answers from cache, so this settles in a frame
 * rather than waiting for a fix.
 */
export function useDeviceCenter(): DeviceCenter {
  const [center, setCenter] = useState<DeviceCenter>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        const position = granted ? await Location.getLastKnownPositionAsync() : null;
        if (cancelled) return;
        setCenter(
          position ? [position.coords.longitude, position.coords.latitude] : null,
        );
      } catch {
        if (!cancelled) setCenter(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return center;
}
