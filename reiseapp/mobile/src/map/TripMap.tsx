import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import type { Feature, LineString } from 'geojson';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Bounds, Route, Stop } from '@/api/types';
import { MAP_STYLE_URL } from '@/config';
import { theme } from '@/ui/theme';

/** Zürich, so an empty trip opens somewhere rather than in the Atlantic. */
const FALLBACK_CENTER: [number, number] = [8.5417, 47.3769];
const MAP_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

function boundsOf(route: Route, stops: Stop[]): Bounds | null {
  const lons = [...route.coordinates.map((c) => c[0]), ...stops.map((s) => s.lon)];
  const lats = [...route.coordinates.map((c) => c[1]), ...stops.map((s) => s.lat)];
  if (lons.length === 0 || lats.length === 0) return null;
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function TripMap({
  route,
  stops,
  onLongPress,
}: {
  route: Route;
  stops: Stop[];
  onLongPress?: (lat: number, lon: number) => void;
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

  const bounds = useMemo(() => boundsOf(route, stops), [route, stops]);

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onLongPress={(event) => {
          const [lon, lat] = event.nativeEvent.lngLat;
          onLongPress?.(lat, lon);
        }}
      >
        <Camera
          initialViewState={
            bounds
              ? { bounds, padding: MAP_PADDING }
              : { center: FALLBACK_CENTER, zoom: 8 }
          }
        />

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
});
