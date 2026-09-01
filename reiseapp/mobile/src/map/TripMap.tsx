import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import type { Feature, LineString } from 'geojson';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { photoSource } from '@/api/photos';
import type { Bounds, Photo, Route, Stop } from '@/api/types';
import { MAP_STYLE_URL } from '@/config';
import { theme } from '@/ui/theme';
import { MapStyleError } from './MapStyleError';
import { placedPhotos } from './photo-pins';
import { useStyleStatus } from './style-status';
import { useDeviceCenter } from './useDeviceCenter';

/** The whole world: the only claim that is true when we know nothing. */
const WORLD_CENTER: [number, number] = [0, 20];
const NEIGHBOURHOOD_ZOOM = 13;
const MAP_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

function boundsOf(route: Route, stops: Stop[], photos: Photo[]): Bounds | null {
  const placed = placedPhotos(photos);
  const lons = [
    ...route.coordinates.map((c) => c[0]),
    ...stops.map((s) => s.lon),
    ...placed.map((p) => p.lon),
  ];
  const lats = [
    ...route.coordinates.map((c) => c[1]),
    ...stops.map((s) => s.lat),
    ...placed.map((p) => p.lat),
  ];
  if (lons.length === 0 || lats.length === 0) return null;
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function TripMap({
  route,
  stops,
  photos = [],
  tripId,
  onLongPress,
  onPhotoPress,
}: {
  route: Route;
  stops: Stop[];
  photos?: Photo[];
  tripId: string;
  onLongPress?: (lat: number, lon: number) => void;
  onPhotoPress?: (photo: Photo) => void;
}) {
  // A one-point "line" is not renderable; the marker layer covers that case.
  const line = useMemo<Feature<LineString> | null>(
    () =>
      route.coordinates.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.coordinates },
          }
        : null,
    [route.coordinates],
  );

  const bounds = useMemo(() => boundsOf(route, stops, photos), [route, stops, photos]);
  const pinned = useMemo(() => placedPhotos(photos), [photos]);
  const style = useStyleStatus();
  const deviceCenter = useDeviceCenter();

  // The camera reads its view state once, on mount, so the map must not be built
  // before we know what to point it at.
  if (!bounds && deviceCenter === undefined) return <View style={styles.container} />;

  const initialViewState = bounds
    ? { bounds, padding: MAP_PADDING }
    : { center: deviceCenter ?? WORLD_CENTER, zoom: deviceCenter ? NEIGHBOURHOOD_ZOOM : 1 };

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onDidFinishLoadingStyle={style.onDidFinishLoadingStyle}
        onDidFailLoadingMap={style.onDidFailLoadingMap}
        onLongPress={(event) => {
          const [lon, lat] = event.nativeEvent.lngLat;
          onLongPress?.(lat, lon);
        }}
      >
        <Camera initialViewState={initialViewState} />

        {line ? (
          <GeoJSONSource id="trip-route" data={line}>
            <Layer
              id="trip-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': theme.colors.accent, 'line-width': 4, 'line-opacity': 0.9 }}
            />
          </GeoJSONSource>
        ) : null}

        {/* Photos below the stop pins: a stop is a place you chose to name, a
            photo only happens to have been taken nearby. */}
        {pinned.map((photo) => (
          <Marker key={photo.id} lngLat={[photo.lon, photo.lat]}>
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="Foto ansehen"
              onPress={() => onPhotoPress?.(photo)}
              style={styles.photoPin}
            >
              <Image
                source={photoSource(tripId, photo.id, 'thumb')}
                style={styles.photoThumb}
                contentFit="cover"
                transition={120}
              />
            </Pressable>
          </Marker>
        ))}

        {stops.map((stop) => (
          <Marker key={stop.id} lngLat={[stop.lon, stop.lat]}>
            <View style={styles.pin}>
              <Text style={styles.pinLabel} numberOfLines={1}>
                {stop.name}
              </Text>
            </View>
          </Marker>
        ))}
      </Map>

      {style.status === 'failed' ? <MapStyleError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', borderRadius: theme.radius },
  map: { flex: 1 },
  pin: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: theme.spacing(1),
    paddingVertical: theme.spacing(0.5),
    maxWidth: 160,
  },
  pinLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  photoPin: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    overflow: 'hidden',
    backgroundColor: theme.colors.border,
    ...theme.shadow.card,
  },
  photoThumb: { flex: 1 },
});
