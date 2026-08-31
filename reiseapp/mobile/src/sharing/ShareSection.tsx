import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share as SystemShare, StyleSheet, Text, View } from 'react-native';

import { downloadExport, EXPORT_LABEL, type ExportFormat } from '@/api/exports';
import { createShare, listShares, revokeShare, shareUrl } from '@/api/shares';
import type { Share } from '@/api/types';
import { Button, ErrorBanner } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { formatDate } from '@/ui/format';
import { theme } from '@/ui/theme';
import { isLive } from './share-state';

const FORMATS: ExportFormat[] = ['pdf', 'gpx', 'json'];

function describeShare(share: Share): string {
  const parts = [
    share.view_count === 1 ? '1 Aufruf' : `${share.view_count} Aufrufe`,
    share.expires_at ? `läuft ab am ${formatDate(share.expires_at)}` : 'ohne Ablauf',
  ];
  if (!share.include_photos) parts.push('ohne Fotos');
  return parts.join(' · ');
}

/**
 * Sharing and export in one place, because they answer the same question:
 * how does this trip leave the phone?
 */
export function ShareSection({ tripId, title }: { tripId: string; title: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares((await listShares(tripId)).filter((share) => isLive(share)));
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportAs(format: ExportFormat) {
    setBusy(format);
    setError(null);
    try {
      const { uri, mimeType } = await downloadExport(tripId, title, format);
      if (!(await Sharing.isAvailableAsync())) {
        setError(`Gespeichert unter ${uri} – dieses Gerät kann nichts weiterreichen.`);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function createLink() {
    setBusy('link');
    setError(null);
    try {
      const created = await createShare(tripId, { label: title });
      const url = shareUrl(created.url_path);
      await load();
      // The token is shown exactly once; the server keeps only a hash of it, so
      // a link that is not passed on now cannot be recovered later.
      await SystemShare.share({ message: `${title} – meine Reise: ${url}` });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function confirmRevoke(share: Share) {
    Alert.alert(
      'Link widerrufen?',
      'Wer ihn hat, sieht die Reise danach nicht mehr. Ein neuer Link lässt sich jederzeit erzeugen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Widerrufen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await revokeShare(tripId, share.id);
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

  return (
    <View style={styles.container}>
      <ErrorBanner message={error} />

      {FORMATS.map((format) => (
        <Button
          key={format}
          title={EXPORT_LABEL[format]}
          variant="ghost"
          busy={busy === format}
          onPress={() => void exportAs(format)}
        />
      ))}

      <Button
        title="Öffentlichen Link erstellen"
        variant="ghost"
        busy={busy === 'link'}
        onPress={() => void createLink()}
      />

      {shares.map((share) => (
        <View key={share.id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{share.label || 'Geteilter Link'}</Text>
            <Text style={styles.rowMeta}>{describeShare(share)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Link widerrufen"
            hitSlop={12}
            onPress={() => confirmRevoke(share)}
          >
            <Text style={styles.revoke}>Widerrufen</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.hint}>
        Ein Link zeigt Karte, Timeline und Fotos schreibgeschützt im Browser – ohne Konto.
        Er ist nur erreichbar, wer ihn hat, und lässt sich jederzeit widerrufen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: theme.colors.text },
  rowMeta: { fontSize: 12, color: theme.colors.muted },
  revoke: { fontSize: 14, color: theme.colors.danger },
  hint: { fontSize: 12, color: theme.colors.muted, lineHeight: 17 },
});
