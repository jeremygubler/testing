import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Field } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 10) {
      setError('Das Passwort braucht mindestens 10 Zeichen.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signUp({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        inviteCode,
      });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Konto anlegen</Text>
          <Text style={styles.subtitle}>
            Diese Instanz ist auf Einladung. Den Code gibt es von der Person, die den Server
            betreibt.
          </Text>
        </View>

        <ErrorBanner message={error} />

        <Field label="Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
        <Field
          label="E-Mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Passwort"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          hint="Mindestens 10 Zeichen."
        />
        <Field label="Einladungscode" value={inviteCode} onChangeText={setInviteCode} />

        <Button title="Registrieren" onPress={submit} busy={busy} />
        <Button title="Zurück zum Login" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(3),
  },
  header: { gap: theme.spacing(0.5), marginBottom: theme.spacing(1) },
  title: { fontSize: 28, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
});
