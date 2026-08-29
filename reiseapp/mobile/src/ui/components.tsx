import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { theme } from './theme';

export function Button({
  title,
  onPress,
  busy = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonGhost,
        (pressed || busy) && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? '#fff' : theme.colors.accent} />
      ) : (
        <Text style={[styles.buttonLabel, !isPrimary && styles.buttonLabelGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
        autoCapitalize={props.autoCapitalize ?? 'none'}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius,
    paddingVertical: theme.spacing(1.75),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: theme.colors.accent },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonLabelGhost: { color: theme.colors.accent },
  field: { gap: theme.spacing(0.5) },
  label: { color: theme.colors.muted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.5),
    fontSize: 16,
    color: theme.colors.text,
  },
  hint: { color: theme.colors.muted, fontSize: 12 },
  error: {
    backgroundColor: '#fbeceb',
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing(1.5),
  },
  errorText: { color: theme.colors.danger, fontSize: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
