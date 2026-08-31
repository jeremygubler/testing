import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';
import {
  permissionState,
  requestBackgroundPermission,
  requestForegroundPermission,
  resumeIfInterrupted,
  startTracking,
  status,
  stopTracking,
  syncNow,
  type PermissionOutcome,
  type TrackingStatus,
} from './controller';
import { planStart } from './permission';
import { PROFILES } from './profile';

const POLL_MS = 4000;

export function TrackingPanel({ tripId, onSynced }: { tripId: string; onSynced?: () => void }) {
  const [state, setState] = useState<TrackingStatus | null>(null);
  const [permission, setPermission] = useState<PermissionOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [next, granted] = await Promise.all([status(), permissionState()]);
    setState(next);
    setPermission(granted);
  }, []);

  useEffect(() => {
    // A cold start after Android killed the process looks the same as coming
    // forward: an active trip, and no updates running.
    void (async () => {
      await resumeIfInterrupted().catch(() => undefined);
      await refresh();
    })();
    const timer = setInterval(() => void refresh(), POLL_MS);
    // Coming forward is also the moment we learn what the user did on the system
    // settings page, and the first moment Android lets us start a service again.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void (async () => {
        await resumeIfInterrupted().catch(() => undefined);
        await refresh();
      })();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  const trackingThisTrip = state?.running === true && state.tripId === tripId;
  const trackingOtherTrip = state?.running === true && state.tripId !== null && state.tripId !== tripId;

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (trackingThisTrip) {
        await stopTracking();
      } else {
        let granted = permission ?? (await permissionState());
        // Only the foreground dialog, deliberately: asking for "always" here
        // would send the user to the settings page and put us in the background,
        // where the start below is exactly what Android refuses.
        if (granted === 'denied') granted = await requestForegroundPermission();
        setPermission(granted);

        const plan = planStart(granted, AppState.currentState);
        if (!plan.start) {
          setMessage(
            plan.reason === 'needs-permission'
              ? 'Ohne Standortfreigabe kann die Route nicht aufgezeichnet werden.'
              : 'Die Aufzeichnung lässt sich nur bei geöffneter App starten.',
          );
          return;
        }
        await startTracking(tripId);
        if (!plan.background) {
          setMessage(
            'Läuft – aber nur solange die App offen ist. „Immer erlauben“ macht die Spur lückenlos.',
          );
        }
      }
      await refresh();
    } catch (caught) {
      setMessage(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function upgrade() {
    setMessage('Dort „Immer zulassen“ wählen – beim Zurückkommen läuft die Aufzeichnung weiter.');
    await requestBackgroundPermission();
    // Android answers a twice-denied permission silently, without leaving the
    // app. Then the settings page is the only way left.
    if ((await permissionState()) !== 'granted' && AppState.currentState === 'active') {
      await Linking.openSettings();
    }
    await refresh();
  }

  async function upload() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncNow();
      setMessage(
        result.failed
          ? 'Upload fehlgeschlagen – die Punkte bleiben gepuffert.'
          : `${result.uploaded} Punkte hochgeladen.`,
      );
      if (!result.failed && result.uploaded > 0) onSynced?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const pending = state?.queue.pending ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {trackingThisTrip ? 'Zeichnet auf' : 'Tracking gestoppt'}
          </Text>
          <Text style={styles.subtitle}>
            {trackingThisTrip
              ? `Modus: ${PROFILES[state?.profile ?? 'walking'].label} · passt sich der Bewegung an`
              : 'Startet die Aufzeichnung dieser Reise.'}
          </Text>
        </View>
        <View style={[styles.dot, trackingThisTrip && styles.dotLive]} />
      </View>

      {trackingOtherTrip ? (
        <Text style={styles.warning}>
          Eine andere Reise wird gerade aufgezeichnet. Starten wechselt die Aufzeichnung
          hierher.
        </Text>
      ) : null}

      {permission === 'foreground-only' ? (
        <View style={styles.upgrade}>
          <Text style={styles.warning}>
            Nur „Während der Nutzung“ erlaubt: Die Spur bricht ab, sobald der Bildschirm
            ausgeht. „Immer“ vergibt Android ausschliesslich in den Systemeinstellungen.
          </Text>
          <Button title="„Immer“ einrichten" variant="ghost" onPress={() => void upgrade()} />
        </View>
      ) : null}

      <View style={styles.queue}>
        <Text style={styles.queueText}>
          {pending === 0
            ? 'Alle Punkte hochgeladen.'
            : `${pending} Punkte gepuffert${
                state?.queue.oldestRecordedAt
                  ? `, ältester von ${new Date(state.queue.oldestRecordedAt).toLocaleString('de-CH')}`
                  : ''
              }.`}
        </Text>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Button
        title={trackingThisTrip ? 'Aufzeichnung stoppen' : 'Aufzeichnung starten'}
        onPress={toggle}
        busy={busy}
      />
      {pending > 0 ? (
        <Button title="Jetzt hochladen" variant="ghost" onPress={upload} busy={busy} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(2),
    gap: theme.spacing(1.25),
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(1) },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.muted },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.border,
    marginTop: 4,
  },
  dotLive: { backgroundColor: theme.colors.accent },
  warning: { fontSize: 13, color: theme.colors.danger, lineHeight: 18 },
  upgrade: { gap: theme.spacing(0.75) },
  queue: {},
  queueText: { fontSize: 13, color: theme.colors.muted },
  message: { fontSize: 13, color: theme.colors.text },
});
