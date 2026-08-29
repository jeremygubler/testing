import { Stack, useLocalSearchParams } from 'expo-router';
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

import { createStop, deleteStop, getRoute, listStops } from '@/api/geo';
import { getTrip, listMembers } from '@/api/trips';
import type { Route, Stop, Trip, TripMember } from '@/api/types';
import { TripMap } from '@/map/TripMap';
import { Button, ErrorBanner, Field, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { formatDate, formatDistance } from '@/ui/format';
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
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route>(EMPTY_ROUTE);
  const [stops, setStops] = useState<Stop[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingStop | null>(null);
  const [stopName, setStopName] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = trip?.role === 'owner' || trip?.role === 'editor';

  const load = useCallback(async () => {
    try {
      setError(null);
      const [loadedTrip, loadedRoute, loadedStops, loadedMembers] = await Promise.all([
        getTrip(id),
        getRoute(id),
        listStops(id),
        listMembers(id),
      ]);
      setTrip(loadedTrip);
      setRoute(loadedRoute);
      setStops(loadedStops);
      setMembers(loadedMembers);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStop() {
    if (!pending || !stopName.trim()) return;
    setSaving(true);
    try {
      const stop = await createStop(id, {
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
              await deleteStop(id, stop.id);
              setStops((current) => current.filter((item) => item.id !== stop.id));
            } catch (caught) {
              setError(describeError(caught));
            }
          })();
        },
      },
    ]);
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
          <Stat label="Distanz" value={formatDistance(route.distance_m)} />
          <Stat label="Punkte" value={String(route.point_count)} />
          <Stat label="Stops" value={String(stops.length)} />
        </View>

        {canEdit ? (
          <Text style={styles.hint}>Lange auf die Karte tippen, um einen Stop zu setzen.</Text>
        ) : null}

        {trip.description ? <Text style={styles.description}>{trip.description}</Text> : null}

        <Section title="Stops">
          {stops.length === 0 ? (
            <Text style={styles.muted}>Noch keine Stops.</Text>
          ) : (
            stops.map((stop) => (
              <Pressable
                key={stop.id}
                onLongPress={canEdit ? () => confirmDelete(stop) : undefined}
                style={styles.row}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{stop.name}</Text>
                  <Text style={styles.rowMeta}>
                    {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}
                    {formatDate(stop.arrived_at) ? ` · ${formatDate(stop.arrived_at)}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </Section>

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
