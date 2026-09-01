import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { cachedTrips, refreshTrips } from '@/store/facade';
import type { Trip } from '@/api/types';
import { Badge, Button, EmptyState, ErrorBanner, Loading } from '@/ui/components';
import { theme } from '@/ui/theme';

function formatRange(trip: Trip): string {
  if (!trip.start_date) return 'Noch kein Datum';
  const start = new Date(trip.start_date).toLocaleDateString('de-CH');
  if (!trip.end_date) return `ab ${start}`;
  return `${start} – ${new Date(trip.end_date).toLocaleDateString('de-CH')}`;
}

function nights(trip: Trip): number | null {
  if (!trip.start_date || !trip.end_date) return null;
  const ms = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime();
  const days = Math.round(ms / 86_400_000);
  return days >= 0 ? days : null;
}

export default function TripListScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    // Cache first so the list is on screen before the network is consulted.
    setTrips(await cachedTrips());
    const result = await refreshTrips();
    setTrips(result.trips);
    setOffline(result.offline);
    setError(null);
  }, []);

  // Reload on focus so a trip created on the next screen shows up on return.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (trips === null && !error) return <Loading />;

  return (
    <View style={styles.container}>
      <FlatList
        data={trips ?? []}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ErrorBanner message={error} />
            {offline ? (
              <View style={styles.offline}>
                <Ionicons name="cloud-offline" size={16} color={theme.colors.inkMuted} />
                <Text style={styles.offlineText}>
                  Offline – gezeigt wird der zuletzt synchronisierte Stand.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <EmptyState
              title="Noch keine Reise"
              hint="Leg eine an, starte die Aufzeichnung, und die Route entsteht von selbst."
              action={<Button title="Erste Reise anlegen" onPress={() => router.push('/trips/new')} />}
            />
          )
        }
        renderItem={({ item }) => {
          const nightCount = nights(item);
          return (
            <Link href={`/trips/${item.id}`} asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.inkSoft} />
                </View>
                <Text style={styles.cardMeta}>{formatRange(item)}</Text>
                <View style={styles.cardFooter}>
                  {nightCount !== null ? (
                    <Badge label={`${nightCount} ${nightCount === 1 ? 'Tag' : 'Tage'}`} />
                  ) : null}
                  {item.role !== 'owner' ? <Badge label={item.role} tone="brand" /> : null}
                </View>
              </Pressable>
            </Link>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          title="Neue Reise"
          onPress={() => router.push('/trips/new')}
          icon={<Ionicons name="add" size={20} color={theme.colors.inkInverted} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.ground },
  list: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: theme.space.huge },
  listHeader: { gap: theme.space.md },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surfaceSunk,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  offlineText: { ...theme.type.caption, color: theme.colors.inkMuted, flex: 1 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.lg,
    gap: theme.space.sm,
    ...theme.shadow.card,
  },
  cardPressed: { backgroundColor: theme.colors.surfaceSunk },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md },
  cardTitle: { ...theme.type.heading, color: theme.colors.ink, flex: 1 },
  cardMeta: { ...theme.type.bodySmall, color: theme.colors.inkSoft },
  cardFooter: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  footer: {
    padding: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
});
