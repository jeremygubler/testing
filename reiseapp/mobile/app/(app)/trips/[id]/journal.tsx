import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getEntry, updateEntry } from '@/api/journal';
import { listPhotos, photoSource } from '@/api/photos';
import { deleteEntryLocally, saveEntryLocally } from '@/store/facade';
import { syncTrip } from '@/sync/engine';
import type { Photo } from '@/api/types';
import { Button, ErrorBanner, Field, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

export default function JournalEditorScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId?: string }>();
  const editing = Boolean(entryId);

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const [selected, setSelected] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tripPhotos, entry] = await Promise.all([
          listPhotos(id),
          entryId ? getEntry(id, entryId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPhotos(tripPhotos);
        if (entry) {
          setTitle(entry.title ?? '');
          setText(entry.text);
          setTimestamp(entry.timestamp);
          setSelected(entry.photos.map((photo) => photo.id));
        }
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, entryId]);

  function toggle(photoId: string) {
    // Selection order is the display order, so appending is meaningful.
    setSelected((current) =>
      current.includes(photoId)
        ? current.filter((item) => item !== photoId)
        : [...current, photoId],
    );
  }

  async function save() {
    if (!text.trim() && !title.trim()) {
      setError('Ein Eintrag braucht Text oder einen Titel.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Saved locally and queued first, so writing an entry works offline.
      const entry = await saveEntryLocally(id, {
        id: entryId,
        title: title.trim() || null,
        text,
        timestamp,
      });

      if (selected.length > 0) {
        // The ordered photo list is not part of the sync payload: it references
        // rows the server has to know about, so it needs the entry to exist
        // there first. Offline it simply waits for the next visit.
        try {
          await syncTrip(id);
          await updateEntry(id, entry.id, { title, text, timestamp, photoIds: selected });
        } catch {
          setError('Eintrag gespeichert. Die Fotozuordnung wird nachgeholt, sobald du online bist.');
          return;
        }
      }
      router.back();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entryId) return;
    setBusy(true);
    try {
      await deleteEntryLocally(id, entryId);
      router.back();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Eintrag bearbeiten' : 'Neuer Eintrag' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />

        <Field label="Titel" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
        <Field
          label="Text"
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="sentences"
          style={styles.textArea}
        />

        <View>
          <Text style={styles.sectionTitle}>
            Fotos {selected.length > 0 ? `(${selected.length} gewählt)` : ''}
          </Text>
          <Text style={styles.hint}>
            Die Reihenfolge der Auswahl ist die Reihenfolge im Eintrag.
          </Text>
          {photos.length === 0 ? (
            <Text style={styles.hint}>Diese Reise hat noch keine Fotos.</Text>
          ) : (
            <View style={styles.grid}>
              {photos.map((photo) => {
                const position = selected.indexOf(photo.id);
                return (
                  <Pressable key={photo.id} onPress={() => toggle(photo.id)}>
                    <Image
                      source={photoSource(id, photo.id, 'thumb')}
                      style={[styles.thumb, position >= 0 && styles.thumbSelected]}
                      contentFit="cover"
                    />
                    {position >= 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{position + 1}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Button title="Speichern" onPress={save} busy={busy} />
        {editing ? <Button title="Löschen" variant="ghost" onPress={remove} busy={busy} /> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(2), gap: theme.spacing(2) },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.muted },
  hint: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(0.75), marginTop: theme.spacing(1) },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: theme.colors.accent },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
