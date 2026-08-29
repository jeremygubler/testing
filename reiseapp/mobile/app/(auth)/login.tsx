import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Field } from '@/ui/components';
import { describeError } from '@/ui/errors';
import { theme } from '@/ui/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
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
          <Text style={styles.title}>reiseapp</Text>
          <Text style={styles.subtitle}>Deine Reisen, auf deinem Server.</Text>
        </View>

        <ErrorBanner message={error} />

        <Field
          label="E-Mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="du@example.com"
        />
        <Field
          label="Passwort"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        <Button title="Anmelden" onPress={submit} busy={busy} />

        <Link href="/register" style={styles.link}>
          <Text style={styles.linkText}>Einladungscode einlösen</Text>
        </Link>
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
  header: { gap: theme.spacing(0.5), marginBottom: theme.spacing(2) },
  title: { fontSize: 32, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 15, color: theme.colors.muted },
  link: { alignSelf: 'center', paddingVertical: theme.spacing(1) },
  linkText: { color: theme.colors.accent, fontSize: 15 },
});
