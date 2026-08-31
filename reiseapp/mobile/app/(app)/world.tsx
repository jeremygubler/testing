import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getWorldOverview } from '@/api/trips';
import type { Bounds, TripOverview, WorldOverview } from '@/api/types';
import { MAP_STYLE_URL } from '@/config';
import { formatDistance } from '@/ui/format';
import { Badge, EmptyState, ErrorBanner, Loading } from '@/ui/components';
import { theme } from '@/ui/theme';

/** Roughly the whole inhabited world, so an empty account still looks like a map. */
const WORLD: Bounds = [-160, -50, 170, 70];
const PADDING = { top: 64, right: 40, bottom: 220, left: 40 };

function union(all: Bounds[]): Bounds | null {
  if (all.length === 0) return null;
  return [
    Math.min(...all.map((b) => b[0])),
    Math.min(...all.map((b) => b[1])),
    Math.max(...all.map((b) => b[2])),
    Math.max(...all.map((b) => b[3])),
  ];
}

function routesOf(trips: TripOverview[]): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = trips
    .filter((trip) => trip.coordinates.length > 1)
    .map((trip) => ({
      type: 'Feature',
      properties: { id: trip.id },
      geometry: { type: 'LineString', coordinates: trip.coordinates },
    }));
  return { type: 'FeatureCollection', features };
}

export default function WorldScreen() {
  const router = useRouter();
  const [data, setData] = useState<WorldOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setData(await getWorldOverview());
          setError(null);
        } catch {
          // The world map is a read-only summary; offline it simply has nothing
          // to show, and saying so beats an empty map that looks broken.
          setError('Übersicht nicht erreichbar – bist du offline?');
        }
      })();
    }, []),
  );

  const routes = useMemo(() => routesOf(data?.trips ?? []), [data]);
  const bounds = useMemo(
    () => union((data?.trips ?? []).map((t) => t.bounds).filter((b): b is Bounds => b !== null)),
    [data],
  );

  if (!data && !error) return <Loading />;

  const trips = data?.trips ?? [];
  const tracked = trips.filter((trip) => trip.coordinates.length > 1);

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera
          initialViewState={{ bounds: bounds ?? WORLD, padding: PADDING }}
        />
        {routes.features.length > 0 ? (
          <GeoJSONSource id="world-routes" data={routes}>
            {/* Two layers: a wide soft halo under a solid line, so a route stays
                visible against both water and land at world zoom. */}
            <Layer
              id="world-routes-halo"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': theme.colors.surface,
                'line-width': 6,
                'line-opacity': 0.7,
              }}
            />
            <Layer
              id="world-routes-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': theme.colors.brand, 'line-width': 2.5 }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>

      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <ErrorBanner message={error} />

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{data?.countries.length ?? 0}</Text>
            <Text style={styles.statLabel}>
              {data?.countries.length === 1 ? 'Land' : 'Länder'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{trips.length}</Text>
            <Text style={styles.statLabel}>{trips.length === 1 ? 'Reise' : 'Reisen'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatDistance(data?.total_distance_m ?? 0)}
            </Text>
            <Text style={styles.statLabel}>zurückgelegt</Text>
          </View>
        </View>

        {trips.length === 0 && !error ? (
          <EmptyState
            title="Die Karte ist noch leer"
            hint="Sobald du eine Reise aufzeichnest, erscheint ihre Spur hier."
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {trips.map((trip) => (
              <Pressable
                key={trip.id}
                accessibilityRole="button"
                onPress={() => router.push(`/trips/${trip.id}`)}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipTitle} numberOfLines={1}>
                  {trip.title}
                </Text>
                <Text style={styles.chipMeta}>
                  {trip.coordinates.length > 1
                    ? formatDistance(trip.distance_m)
                    : 'noch keine Spur'}
                </Text>
                {trip.countries.length > 0 ? (
                  <Badge label={trip.countries.join(' · ')} tone="brand" />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {trips.length > tracked.length ? (
          <View style={styles.hint}>
            <Ionicons name="information-circle" size={15} color={theme.colors.inkSoft} />
            <Text style={styles.hintText}>
              {trips.length - tracked.length} Reise
              {trips.length - tracked.length === 1 ? '' : 'n'} ohne aufgezeichnete Spur.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.ground },
  map: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xl,
    gap: theme.space.lg,
    ...theme.shadow.raised,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.borderStrong,
  },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: theme.colors.border },
  statValue: {
    ...theme.type.stat,
    color: theme.colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { ...theme.type.caption, color: theme.colors.inkSoft },
  strip: { gap: theme.space.md, paddingRight: theme.space.lg },
  chip: {
    backgroundColor: theme.colors.ground,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    gap: theme.space.xs + 2,
    minWidth: 150,
    maxWidth: 220,
  },
  chipPressed: { backgroundColor: theme.colors.surfaceSunk },
  chipTitle: { ...theme.type.subheading, color: theme.colors.ink },
  chipMeta: { ...theme.type.caption, color: theme.colors.inkSoft },
  hint: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  hintText: { ...theme.type.caption, color: theme.colors.inkSoft, flex: 1 },
});
