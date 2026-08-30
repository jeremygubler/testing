import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getTimeline } from '@/api/journal';
import { photoSource } from '@/api/photos';
import type { Photo, TimelineItem } from '@/api/types';
import { Button, ErrorBanner, Loading } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

function formatMoment(value: string): string {
  return new Date(value).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PhotoStrip({ tripId, photos }: { tripId: string; photos: Photo[] }) {
  if (photos.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
      {photos.map((photo) => (
        <Image
          key={photo.id}
          source={photoSource(tripId, photo.id, 'thumb')}
          style={styles.stripImage}
          contentFit="cover"
          transition={120}
        />
      ))}
    </ScrollView>
  );
}

export default function TimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems((await getTimeline(id)).items);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (items === null && !error) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: 'Timeline' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <ErrorBanner message={error} />

        {items?.length === 0 ? (
          <Text style={styles.empty}>
            Noch nichts passiert. Stops, Fotos und Tagebucheinträge erscheinen hier
            chronologisch.
          </Text>
        ) : null}

        {items?.map((item, index) => (
          <View key={`${item.kind}-${item.at}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, styles[item.kind]]} />
              {index < items.length - 1 ? <View style={styles.line} /> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.moment}>{formatMoment(item.at)}</Text>

              {item.kind === 'stop' && item.stop ? (
                <>
                  <Text style={styles.title}>{item.stop.name}</Text>
                  {item.stop.notes ? <Text style={styles.body}>{item.stop.notes}</Text> : null}
                </>
              ) : null}

              {item.kind === 'journal' && item.entry ? (
                <Pressable
                  onPress={() =>
                    router.push(`/trips/${id}/journal?entryId=${item.entry?.id ?? ''}`)
                  }
                >
                  {item.entry.title ? (
                    <Text style={styles.title}>{item.entry.title}</Text>
                  ) : null}
                  <Text style={styles.body}>{item.entry.text}</Text>
                  <PhotoStrip tripId={id} photos={item.entry.photos} />
                </Pressable>
              ) : null}

              {item.kind === 'photos' ? (
                <>
                  <Text style={styles.title}>
                    {item.photos.length === 1 ? 'Ein Foto' : `${item.photos.length} Fotos`}
                  </Text>
                  <PhotoStrip tripId={id} photos={item.photos} />
                </>
              ) : null}
            </View>
          </View>
        ))}

        <Button title="Eintrag schreiben" onPress={() => router.push(`/trips/${id}/journal`)} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(2), gap: theme.spacing(1) },
  empty: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', gap: theme.spacing(1.5) },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  line: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginVertical: 4 },
  stop: { backgroundColor: theme.colors.accent },
  journal: { backgroundColor: theme.colors.text },
  photos: { backgroundColor: theme.colors.muted },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(1.75),
    marginBottom: theme.spacing(1),
    gap: theme.spacing(0.5),
  },
  moment: { fontSize: 12, color: theme.colors.muted },
  title: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  body: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  strip: { marginTop: theme.spacing(1) },
  stripImage: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginRight: theme.spacing(0.75),
    backgroundColor: theme.colors.border,
  },
});
