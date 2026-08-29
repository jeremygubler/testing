import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { createTrip } from '@/api/trips';
import { Button, ErrorBanner, Field } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function NewTripScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) {
      setError('Die Reise braucht einen Titel.');
      return;
    }
    for (const value of [startDate, endDate]) {
      if (value && !ISO_DATE.test(value)) {
        setError('Datum bitte als JJJJ-MM-TT.');
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      const trip = await createTrip({
        title: title.trim(),
        description,
        startDate,
        endDate,
      });
      router.replace(`/trips/${trip.id}`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Neue Reise' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <Field label="Titel" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
        <Field
          label="Beschreibung"
          value={description}
          onChangeText={setDescription}
          multiline
          autoCapitalize="sentences"
        />
        <Field label="Start" value={startDate} onChangeText={setStartDate} placeholder="2026-07-01" />
        <Field label="Ende" value={endDate} onChangeText={setEndDate} placeholder="2026-07-21" />
        <Button title="Anlegen" onPress={submit} busy={busy} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(3), gap: theme.spacing(2) },
});
