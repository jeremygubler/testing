import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { clearTrack, getRoute, getStats } from '@/api/geo';
import { deleteTrip, listMembers } from '@/api/trips';
import type { Photo, Route, Stop, Trip, TripMember, TripStats } from '@/api/types';
import { TripMap } from '@/map/TripMap';
import { PhotoGallery } from '@/photos/PhotoGallery';
import {
  cachedTrip,
  createStopLocally,
  deleteStopLocally,
  lastSyncedAt as readLastSyncedAt,
  refreshTrip,
} from '@/store/facade';
import { ShareSection } from '@/sharing/ShareSection';
import { SyncStatus } from '@/sync/SyncStatus';
import { TrackingPanel } from '@/tracking/TrackingPanel';
import { Button, ErrorBanner, Field, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { dominantMode, formatDate, formatDistance, formatDuration } from '@/ui/format';
import { theme } from '@/ui/theme';

const EMPTY_ROUTE: Route = {
  type: 'LineString',
  coordinates: [],
  point_count: 0,
  distance_m: 0,
  bounds: null,
};

interface PendingStop {
  lat: number;
  lon: number;
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route>(EMPTY_ROUTE);
  const [stops, setStops] = useState<Stop[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingStop | null>(null);
  const [stopName, setStopName] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = trip?.role === 'owner' || trip?.role === 'editor';

  const apply = useCallback((data: Awaited<ReturnType<typeof cachedTrip>>) => {
    if (data.trip) setTrip(data.trip);
    setStops(data.stops);
    setPhotos(data.photos);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    // What is already on the device, before anything touches the network.
    apply(await cachedTrip(id));

    const result = await refreshTrip(id);
    apply(result.data);
    setOffline(result.offline);
    setSyncedAt(await readLastSyncedAt(id));

    // Route and members are derived server-side and stay online-only for now.
    try {
      const [loadedRoute, loadedMembers, loadedStats] = await Promise.all([
        getRoute(id),
        listMembers(id),
        getStats(id),
      ]);
      setRoute(loadedRoute);
      setMembers(loadedMembers);
      setStats(loadedStats);
    } catch (caught) {
      if (!result.offline) setError(describeError(caught));
    }
  }, [id, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStop() {
    if (!pending || !stopName.trim()) return;
    setSaving(true);
    try {
      // Written locally and queued; it appears immediately, with or without network.
      const stop = await createStopLocally(id, {
        name: stopName.trim(),
        lat: pending.lat,
        lon: pending.lon,
      });
      setStops((current) => [...current, stop]);
      setPending(null);
      setStopName('');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(stop: Stop) {
    Alert.alert('Stop löschen?', stop.name, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteStopLocally(id, stop.id);
              setStops((current) => current.filter((item) => item.id !== stop.id));
            } catch (caught) {
              setError(describeError(caught));
            }
          })();
        },
      },
    ]);
  }

  function confirmClearTrack() {
    Alert.alert(
      'Spur löschen?',
      `${route.point_count} aufgezeichnete Punkte werden entfernt. Stops, Fotos und `
        + 'Tagebuch bleiben.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await clearTrack(id);
                await load();
              } catch (caught) {
                setError(describeError(caught));
              }
            })();
          },
        },
      ],
    );
  }

  function confirmDeleteTrip() {
    Alert.alert(
      'Reise löschen?',
      `„${trip?.title ?? ''}" wird mit allen Punkten, Stops und Fotos entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteTrip(id);
                router.replace('/trips');
              } catch (caught) {
                setError(describeError(caught));
              }
            })();
          },
        },
      ],
    );
  }

  if (error && !trip) {
    return (
      <View style={styles.container}>
        <ErrorBanner message={error} />
      </View>
    );
  }
  if (!trip) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: trip.title }} />
      <ScrollView contentContainerStyle={styles.container}>
        <ErrorBanner message={error} />

        <SyncStatus
          tripId={id}
          offline={offline}
          lastSyncedAt={syncedAt}
          onSync={() => void load()}
        />

        <View style={styles.mapFrame}>
          <TripMap
            route={route}
            stops={stops}
            onLongPress={
              canEdit ? (lat, lon) => setPending({ lat, lon }) : undefined
            }
          />
        </View>

        <View style={styles.stats}>
          <Stat label="Distanz" value={formatDistance(stats?.distance_m ?? route.distance_m)} />
          <Stat
            label="Aufstieg"
            value={stats ? `${Math.round(stats.elevation_gain_m)} m` : '–'}
          />
          <Stat label="Fotos" value={String(photos.length)} />
        </View>

        {stats && stats.moving_seconds > 0 ? (
          <Text style={styles.hint}>
            {formatDuration(stats.moving_seconds)} in Bewegung
            {dominantMode(stats) ? ` · überwiegend ${dominantMode(stats)}` : ''}
            {stats.countries.length > 1 ? ` · ${stats.countries.length} Länder` : ''}
          </Text>
        ) : null}

        {canEdit ? <TrackingPanel tripId={id} onSynced={() => void load()} /> : null}

        {canEdit ? (
          <Text style={styles.hint}>Lange auf die Karte tippen, um einen Stop zu setzen.</Text>
        ) : null}

        {trip.description ? <Text style={styles.description}>{trip.description}</Text> : null}

        <Section title="Stops">
          {stops.length === 0 ? (
            <Text style={styles.muted}>Noch keine Stops.</Text>
          ) : (
            stops.map((stop) => (
              <View key={stop.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{stop.name}</Text>
                  <Text style={styles.rowMeta}>
                    {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}
                    {formatDate(stop.arrived_at) ? ` · ${formatDate(stop.arrived_at)}` : ''}
                  </Text>
                </View>
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Stop ${stop.name} löschen`}
                    // A visible button, not the long-press this used to be: an
                    // undiscoverable gesture is the same as no function at all.
                    hitSlop={12}
                    onPress={() => confirmDelete(stop)}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </Section>

        <Button
          title="Timeline ansehen"
          variant="ghost"
          onPress={() => router.push(`/trips/${id}/timeline`)}
        />

        <Section title={`Fotos (${photos.length})`}>
          <PhotoGallery
            tripId={id}
            photos={photos}
            canEdit={canEdit}
            onChanged={() => void load()}
          />
        </Section>

        {trip.role === 'owner' ? (
          <Section title="Teilen & Export">
            <ShareSection tripId={id} title={trip.title} />
          </Section>
        ) : null}

        {canEdit ? (
          <Section title="Verwalten">
            {route.point_count > 0 ? (
              <Button
                title={`Spur löschen (${route.point_count} Punkte)`}
                variant="ghost"
                onPress={confirmClearTrack}
              />
            ) : null}
            {trip.role === 'owner' ? (
              <Button title="Reise löschen" variant="ghost" onPress={confirmDeleteTrip} />
            ) : null}
            <Text style={styles.muted}>
              Die Spur zu löschen behält die Reise mit Stops, Fotos und Tagebuch – nützlich,
              wenn eine Aufzeichnung nichts taugt.
            </Text>
          </Section>
        ) : null}

        <Section title="Reisende">
          {members.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <Text style={styles.rowTitle}>{member.display_name}</Text>
              <Text style={styles.rowMeta}>{member.role}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>

      <Modal visible={pending !== null} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Neuer Stop</Text>
            <Text style={styles.muted}>
              {pending ? `${pending.lat.toFixed(5)}, ${pending.lon.toFixed(5)}` : ''}
            </Text>
            <Field
              label="Name"
              value={stopName}
              onChangeText={setStopName}
              autoCapitalize="sentences"
              autoFocus
            />
            <Button title="Speichern" onPress={saveStop} busy={saving} />
            <Button
              title="Abbrechen"
              variant="ghost"
              onPress={() => {
                setPending(null);
                setStopName('');
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(2), gap: theme.spacing(2) },
  mapFrame: {
    height: 320,
    borderRadius: theme.radius,
    borderColor: theme.colors.border,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', gap: theme.spacing(1.5) },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(1.5),
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.muted },
  hint: { fontSize: 13, color: theme.colors.muted },
  description: { fontSize: 15, color: theme.colors.text, lineHeight: 22 },
  section: { gap: theme.spacing(1) },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
    textTransform: 'uppercase',
  },
  muted: { fontSize: 14, color: theme.colors.muted },
  row: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(1.75),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: theme.colors.text },
  rowMeta: { fontSize: 13, color: theme.colors.muted },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
});
