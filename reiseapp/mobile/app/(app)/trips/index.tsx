import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listTrips } from '@/api/trips';
import type { Trip } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

function formatRange(trip: Trip): string {
  if (!trip.start_date) return 'Noch kein Datum';
  const start = new Date(trip.start_date).toLocaleDateString('de-CH');
  if (!trip.end_date) return `ab ${start}`;
  return `${start} – ${new Date(trip.end_date).toLocaleDateString('de-CH')}`;
}

export default function TripListScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTrips(await listTrips());
    } catch (caught) {
      setError(describeError(caught));
    }
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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hallo {user?.display_name}</Text>
          <Text style={styles.subtitle}>{trips?.length ?? 0} Reisen</Text>
        </View>
        <Pressable onPress={signOut} accessibilityRole="button">
          <Text style={styles.signOut}>Abmelden</Text>
        </Pressable>
      </View>

      <ErrorBanner message={error} />

      <FlatList
        data={trips ?? []}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          error ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Noch keine Reise</Text>
              <Text style={styles.emptyText}>
                Leg eine an – Route, Stops und Fotos kommen in den nächsten Phasen dazu.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Link href={`/trips/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{formatRange(item)}</Text>
              {item.role !== 'owner' ? (
                <Text style={styles.badge}>geteilt · {item.role}</Text>
              ) : null}
            </Pressable>
          </Link>
        )}
      />

      <View style={styles.footer}>
        <Button title="Neue Reise" onPress={() => router.push('/trips/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: theme.spacing(6) },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing(3),
    paddingBottom: theme.spacing(2),
  },
  greeting: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.muted },
  signOut: { color: theme.colors.accent, fontSize: 15 },
  list: { paddingHorizontal: theme.spacing(3), gap: theme.spacing(1.5), paddingBottom: theme.spacing(3) },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(2),
    gap: theme.spacing(0.5),
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  cardMeta: { fontSize: 13, color: theme.colors.muted },
  badge: { fontSize: 12, color: theme.colors.accent },
  empty: { alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(6) },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.muted, textAlign: 'center' },
  footer: { padding: theme.spacing(3) },
});
