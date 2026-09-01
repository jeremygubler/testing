import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deletePhoto, photoSource, updatePhoto } from '@/api/photos';
import type { Photo, Stop } from '@/api/types';
import { ErrorBanner } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { formatDate } from '@/ui/format';
import { theme } from '@/ui/theme';

const POSITION_LABEL: Record<Photo['position_source'], string> = {
  exif: 'Position aus dem Foto',
  interpolated: 'Position aus der Route berechnet',
  manual: 'Position von Hand gesetzt',
  stop: 'Position vom Stop',
  none: 'Ohne Position',
};

/**
 * The full-screen photo, controlled from outside.
 *
 * Which photo is open belongs to the screen, not to the grid: a photo is opened
 * from the gallery and from a pin on the map, and two components each holding
 * their own copy of "the open photo" is how two viewers end up on screen at once.
 */
export function PhotoViewer({
  tripId,
  photo,
  stops,
  canEdit,
  onClose,
  onChanged,
}: {
  tripId: string;
  photo: Photo | null;
  stops: Stop[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  // The server answers a stop change with the updated photo; showing that
  // straight away is what makes "Ohne Position" flip to "Position vom Stop"
  // under the user's finger.
  const [edited, setEdited] = useState<Photo | null>(null);
  const current = edited?.id === photo?.id ? edited : photo;

  async function assignStop(stopId: string | null) {
    if (current === null) return;
    try {
      setEdited(await updatePhoto(tripId, current.id, { stopId }));
      onChanged();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  function confirmRemove() {
    if (current === null) return;
    const id = current.id;
    Alert.alert('Foto löschen?', 'Das Original wird vom Server entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deletePhoto(tripId, id);
              onClose();
              onChanged();
            } catch (caught) {
              onClose();
              setError(describeError(caught));
            }
          })();
        },
      },
    ]);
  }

  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Without this the Android back button and the back gesture do nothing at
      // all, and a full-screen photo becomes a room with no door.
      onRequestClose={onClose}
    >
      <View style={styles.viewer}>
        {current ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto schliessen"
              hitSlop={16}
              onPress={onClose}
              style={[styles.closeButton, { top: insets.top + theme.spacing(1) }]}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>

            <Image
              source={photoSource(tripId, current.id, 'original')}
              style={styles.full}
              contentFit="contain"
            />

            <View style={[styles.bar, { paddingBottom: insets.bottom + theme.spacing(2) }]}>
              <ErrorBanner message={error} />
              <Text style={styles.text}>
                {formatDate(current.taken_at) ?? 'Ohne Datum'} ·{' '}
                {POSITION_LABEL[current.position_source]}
              </Text>

              {canEdit && stops.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stopRow}
                >
                  <Pressable
                    onPress={() => void assignStop(null)}
                    style={[styles.chip, current.stop_id === null && styles.chipActive]}
                  >
                    <Text style={styles.chipText}>Kein Stop</Text>
                  </Pressable>
                  {stops.map((stop) => (
                    <Pressable
                      key={stop.id}
                      onPress={() => void assignStop(stop.id)}
                      style={[styles.chip, current.stop_id === stop.id && styles.chipActive]}
                    >
                      <Text style={styles.chipText} numberOfLines={1}>
                        {stop.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.actions}>
                {canEdit ? (
                  <Pressable hitSlop={12} onPress={confirmRemove}>
                    <Text style={styles.destructive}>Löschen</Text>
                  </Pressable>
                ) : null}
                <Pressable hitSlop={12} onPress={onClose}>
                  <Text style={styles.close}>Schliessen</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  bar: {
    paddingTop: theme.spacing(2),
    paddingHorizontal: theme.spacing(2),
    gap: theme.spacing(1),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  text: { color: '#fff', fontSize: 13 },
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
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  destructive: { color: '#ff8a80', fontSize: 15 },
  close: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
