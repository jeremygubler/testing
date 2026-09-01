import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Trip } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { cachedTrips, refreshTrips } from '@/store/facade';
import { Button, Card, Divider, Screen, SectionHeader, StatTile } from '@/ui/components';
import { theme } from '@/ui/theme';
import { MAP_STYLE_URL } from '@/config';

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Which host serves the map, without the query string that carries the key. */
function styleHost(url: string): string {
  const match = /^https?:\/\/([^/]+)/.exec(url);
  return match?.[1] ?? url;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setTrips(await cachedTrips());
        const result = await refreshTrips();
        setTrips(result.trips);
      })();
    }, []),
  );

  const owned = trips.filter((trip) => trip.role === 'owner').length;

  return (
    <Screen>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.display_name)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{user?.display_name ?? 'Unbekannt'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <StatTile value={String(trips.length)} label={trips.length === 1 ? 'Reise' : 'Reisen'} />
        <StatTile value={String(owned)} label="eigene" />
        <StatTile value={String(trips.length - owned)} label="geteilt" />
      </View>

      <SectionHeader title="Karte" />
      <Card>
        <Text style={styles.rowLabel}>Kartenstil</Text>
        <Text style={styles.rowValue}>{styleHost(MAP_STYLE_URL)}</Text>
        <Divider />
        <Text style={styles.rowHint}>
          Wird beim Bauen über EXPO_PUBLIC_MAP_STYLE_URL gesetzt. Ein eigener Tileserver im
          Homelab macht die Karte offline verfügbar.
        </Text>
      </Card>

      <SectionHeader title="Konto" />
      <Button title="Abmelden" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.space.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...theme.type.title, color: theme.colors.inkInverted },
  identityText: { flex: 1, gap: 2 },
  name: { ...theme.type.title, color: theme.colors.ink },
  email: { ...theme.type.bodySmall, color: theme.colors.inkSoft },
  stats: { flexDirection: 'row', gap: theme.space.md },
  rowLabel: { ...theme.type.label, color: theme.colors.inkSoft },
  rowValue: { ...theme.type.body, color: theme.colors.ink },
  rowHint: { ...theme.type.caption, color: theme.colors.inkSoft },
});
