import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deletePhoto, photoSource, updatePhoto, uploadPhoto } from '@/api/photos';
import type { Photo, Stop } from '@/api/types';
import { Button, ErrorBanner } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { formatDate } from '@/ui/format';
import { theme } from '@/ui/theme';

const COLUMNS = 3;

const POSITION_LABEL: Record<Photo['position_source'], string> = {
  exif: 'Position aus dem Foto',
  interpolated: 'Position aus der Route berechnet',
  manual: 'Position von Hand gesetzt',
  stop: 'Position vom Stop',
  none: 'Ohne Position',
};

export function PhotoGallery({
  tripId,
  photos,
  stops,
  canEdit,
  onChanged,
}: {
  tripId: string;
  photos: Photo[];
  stops: Stop[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  // A full-screen modal draws under the status and navigation bars, so its own
  // controls have to be inset by hand or they end up beneath the system UI,
  // visible but untappable.
  const insets = useSafeAreaInsets();

  const pickAndUpload = useCallback(async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Ohne Zugriff auf die Mediathek können keine Fotos hinzugefügt werden.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      // Originals, not previews: full resolution and EXIF intact is the point.
      quality: 1,
      exif: true,
    });
    if (picked.canceled) return;

    setBusy(true);
    let uploaded = 0;
    let duplicates = 0;
    try {
      for (const [index, asset] of picked.assets.entries()) {
        setProgress(`Lade ${index + 1} von ${picked.assets.length} hoch …`);
        const result = await uploadPhoto(tripId, asset);
        if (result.duplicate) duplicates += 1;
        else uploaded += 1;
      }
      setProgress(
        duplicates > 0
          ? `${uploaded} hochgeladen, ${duplicates} waren schon da.`
          : `${uploaded} Fotos hochgeladen.`,
      );
      onChanged();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }, [tripId, onChanged]);

  /**
   * Filing a photo under a stop also gives it that stop's position, unless it
   * already carries one from its own EXIF. For a screenshot or a forwarded
   * picture this is the only location it will ever have.
   */
  async function assignStop(photo: Photo, stopId: string | null) {
    try {
      const updated = await updatePhoto(tripId, photo.id, { stopId });
      setOpen(updated);
      onChanged();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  function confirmRemove(photo: Photo) {
    Alert.alert('Foto löschen?', 'Das Original wird vom Server entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deletePhoto(tripId, photo.id);
              setOpen(null);
              onChanged();
            } catch (caught) {
              setOpen(null);
              setError(describeError(caught));
            }
          })();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ErrorBanner message={error} />
      {progress ? <Text style={styles.progress}>{progress}</Text> : null}

      {photos.length === 0 ? (
        <Text style={styles.empty}>Noch keine Fotos.</Text>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(photo) => photo.id}
          numColumns={COLUMNS}
          scrollEnabled={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.cell} onPress={() => setOpen(item)}>
              <Image
                source={photoSource(tripId, item.id, 'thumb')}
                style={styles.thumb}
                contentFit="cover"
                transition={120}
              />
            </Pressable>
          )}
        />
      )}

      {canEdit ? (
        <Button title="Fotos hinzufügen" onPress={pickAndUpload} busy={busy} variant="ghost" />
      ) : null}

      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        // Without this the Android back button and the back gesture do nothing
        // at all, and a full-screen photo becomes a room with no door.
        onRequestClose={() => setOpen(null)}
      >
        <View style={styles.viewer}>
          {open ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Foto schliessen"
                hitSlop={16}
                onPress={() => setOpen(null)}
                style={[styles.closeButton, { top: insets.top + theme.spacing(1) }]}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>

              <Image
                source={photoSource(tripId, open.id, 'original')}
                style={styles.full}
                contentFit="contain"
              />

              <View style={[styles.viewerBar, { paddingBottom: insets.bottom + theme.spacing(2) }]}>
                <Text style={styles.viewerText}>
                  {formatDate(open.taken_at) ?? 'Ohne Datum'} · {POSITION_LABEL[open.position_source]}
                </Text>

                {canEdit && stops.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.stopRow}
                  >
                    <Pressable
                      onPress={() => void assignStop(open, null)}
                      style={[styles.chip, open.stop_id === null && styles.chipActive]}
                    >
                      <Text style={styles.chipText}>Kein Stop</Text>
                    </Pressable>
                    {stops.map((stop) => (
                      <Pressable
                        key={stop.id}
                        onPress={() => void assignStop(open, stop.id)}
                        style={[styles.chip, open.stop_id === stop.id && styles.chipActive]}
                      >
                        <Text style={styles.chipText} numberOfLines={1}>
                          {stop.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.viewerActions}>
                  {canEdit ? (
                    <Pressable hitSlop={12} onPress={() => confirmRemove(open)}>
                      <Text style={styles.destructive}>Löschen</Text>
                    </Pressable>
                  ) : null}
                  <Pressable hitSlop={12} onPress={() => setOpen(null)}>
                    <Text style={styles.close}>Schliessen</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing(1) },
  grid: { gap: theme.spacing(0.5) },
  row: { gap: theme.spacing(0.5) },
  cell: { flex: 1 / COLUMNS, aspectRatio: 1 },
  thumb: { flex: 1, borderRadius: 8, backgroundColor: theme.colors.border },
  empty: { fontSize: 14, color: theme.colors.muted },
  progress: { fontSize: 13, color: theme.colors.muted },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { flex: 1 },
  closeButton: {
    position: 'absolute',
    right: theme.spacing(2),
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  viewerBar: {
    paddingTop: theme.spacing(2),
    paddingHorizontal: theme.spacing(2),
    gap: theme.spacing(1),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewerText: { color: '#fff', fontSize: 13 },
  stopRow: { gap: theme.spacing(0.75), paddingVertical: theme.spacing(0.5) },
  chip: {
    paddingHorizontal: theme.spacing(1.25),
    paddingVertical: theme.spacing(0.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    maxWidth: 180,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: '#fff', fontSize: 13 },
  viewerActions: { flexDirection: 'row', justifyContent: 'space-between' },
  destructive: { color: '#ff8a80', fontSize: 15 },
  close: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
