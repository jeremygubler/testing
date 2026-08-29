import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getTrip, listMembers } from '@/api/trips';
import type { Trip, TripMember } from '@/api/types';
import { ErrorBanner, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedTrip, loadedMembers] = await Promise.all([getTrip(id), listMembers(id)]);
        if (cancelled) return;
        setTrip(loadedTrip);
        setMembers(loadedMembers);
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
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
        {trip.description ? <Text style={styles.description}>{trip.description}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reisende</Text>
          {members.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <Text style={styles.rowTitle}>{member.display_name}</Text>
              <Text style={styles.rowMeta}>{member.role}</Text>
            </View>
          ))}
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Karte, Route und Stops</Text>
          <Text style={styles.placeholderText}>
            Kommt in Phase 2. Danach: GPS-Tracking im Hintergrund, Fotos mit EXIF-Zuordnung und
            die Timeline.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(3), gap: theme.spacing(3) },
  description: { fontSize: 15, color: theme.colors.text, lineHeight: 22 },
  section: { gap: theme.spacing(1) },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase' },
  row: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(1.75),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: { fontSize: 15, color: theme.colors.text },
  rowMeta: { fontSize: 13, color: theme.colors.muted },
  placeholder: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radius,
    padding: theme.spacing(2),
    gap: theme.spacing(0.5),
  },
  placeholderTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  placeholderText: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
});
