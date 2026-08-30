import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/ui/theme';
import { pendingCount } from './engine';

/** Small, honest status line: what is still local, and when we last talked to
 * the server. */
export function SyncStatus({
  tripId,
  offline,
  onSync,
  lastSyncedAt,
}: {
  tripId: string;
  offline: boolean;
  onSync: () => void;
  lastSyncedAt: string | null;
}) {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh, tripId]);

  const label = offline
    ? 'Offline – Änderungen werden gespeichert und später übertragen.'
    : pending > 0
      ? `${pending} Änderung${pending === 1 ? '' : 'en'} noch nicht übertragen.`
      : lastSyncedAt
        ? `Synchronisiert um ${new Date(lastSyncedAt).toLocaleTimeString('de-CH')}.`
        : 'Noch nicht synchronisiert.';

  return (
    <Pressable onPress={onSync} style={[styles.bar, offline && styles.offline]}>
      <View style={[styles.dot, offline ? styles.dotOffline : styles.dotOnline]} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
    paddingHorizontal: theme.spacing(1.25),
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  offline: { borderColor: theme.colors.danger },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: theme.colors.accent },
  dotOffline: { backgroundColor: theme.colors.danger },
  text: { fontSize: 12, color: theme.colors.muted, flex: 1 },
});
