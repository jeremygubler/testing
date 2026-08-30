import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { deletePhoto, photoSource, uploadPhoto } from '@/api/photos';
import type { Photo } from '@/api/types';
import { Button, ErrorBanner } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { formatDate } from '@/ui/format';
import { theme } from '@/ui/theme';

const COLUMNS = 3;

const POSITION_LABEL: Record<Photo['position_source'], string> = {
  exif: 'Position aus dem Foto',
  interpolated: 'Position aus der Route berechnet',
  manual: 'Position von Hand gesetzt',
  none: 'Ohne Position',
};

export function PhotoGallery({
  tripId,
  photos,
  canEdit,
  onChanged,
}: {
  tripId: string;
  photos: Photo[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);

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

  async function remove(photo: Photo) {
    try {
      await deletePhoto(tripId, photo.id);
      setOpen(null);
      onChanged();
    } catch (caught) {
      setError(describeError(caught));
    }
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

      <Modal visible={open !== null} transparent animationType="fade">
        <View style={styles.viewer}>
          {open ? (
            <>
              <Image
                source={photoSource(tripId, open.id, 'original')}
                style={styles.full}
                contentFit="contain"
              />
              <View style={styles.viewerBar}>
                <Text style={styles.viewerText}>
                  {formatDate(open.taken_at) ?? 'Ohne Datum'} · {POSITION_LABEL[open.position_source]}
                </Text>
                <View style={styles.viewerActions}>
                  {canEdit ? (
                    <Pressable onPress={() => void remove(open)}>
                      <Text style={styles.destructive}>Löschen</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setOpen(null)}>
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
  viewerBar: {
    padding: theme.spacing(2),
    gap: theme.spacing(1),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewerText: { color: '#fff', fontSize: 13 },
  viewerActions: { flexDirection: 'row', justifyContent: 'space-between' },
  destructive: { color: '#ff8a80', fontSize: 15 },
  close: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
