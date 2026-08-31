import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { photoSource, uploadPhoto } from '@/api/photos';
import type { Photo } from '@/api/types';
import { Button, ErrorBanner } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

const COLUMNS = 3;

export function PhotoGallery({
  tripId,
  photos,
  canEdit,
  onOpen,
  onChanged,
}: {
  tripId: string;
  photos: Photo[];
  canEdit: boolean;
  onOpen: (photo: Photo) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <Pressable style={styles.cell} onPress={() => onOpen(item)}>
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
});
