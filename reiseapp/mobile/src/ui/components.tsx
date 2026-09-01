import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { theme } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Rendered before the label; a glyph or a small view, not a whole layout. */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && styles[`buttonPressed_${variant}`],
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.inkInverted : theme.colors.brand} />
      ) : (
        <View style={styles.buttonRow}>
          {icon}
          <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`]]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.inkSoft}
        style={[styles.input, error ? styles.inputInvalid : null]}
        autoCapitalize={props.autoCapitalize ?? 'none'}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={theme.colors.brand} />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

/** Page frame: one background, one horizontal rhythm, one scroll behaviour. */
export function Screen({
  children,
  scroll = true,
  refreshControl,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (!scroll) {
    return <View style={[styles.screen, styles.screenPad, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenPad, contentStyle]}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/** A single figure with its unit. Digits are tabular so columns line up. */
export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {action}
    </View>
  );
}

/**
 * Empty states say what would be here and how to put it there. "Noch keine
 * Stops." tells a reader nothing they did not already see.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'brand' | 'recording';
}) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      {tone === 'recording' ? <View style={styles.badgeDot} /> : null}
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.ground },
  screenPad: { padding: theme.space.lg, gap: theme.space.lg },

  button: {
    borderRadius: theme.radii.pill,
    paddingVertical: theme.space.md + 2,
    paddingHorizontal: theme.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  button_primary: { backgroundColor: theme.colors.brand },
  button_secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  button_ghost: { backgroundColor: 'transparent', paddingHorizontal: theme.space.md },
  button_danger: { backgroundColor: theme.colors.dangerSoft },
  buttonPressed_primary: { backgroundColor: theme.colors.brandPressed },
  buttonPressed_secondary: { backgroundColor: theme.colors.surfaceSunk },
  buttonPressed_ghost: { opacity: 0.6 },
  buttonPressed_danger: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...theme.type.subheading },
  buttonLabel_primary: { color: theme.colors.inkInverted },
  buttonLabel_secondary: { color: theme.colors.ink },
  buttonLabel_ghost: { color: theme.colors.brand },
  buttonLabel_danger: { color: theme.colors.danger },

  field: { gap: theme.space.xs + 2 },
  fieldLabel: { ...theme.type.label, color: theme.colors.inkMuted },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md + 2,
    ...theme.type.body,
    color: theme.colors.ink,
  },
  inputInvalid: { borderColor: theme.colors.danger },
  fieldHint: { ...theme.type.caption, color: theme.colors.inkSoft },
  fieldError: { ...theme.type.caption, color: theme.colors.danger },

  banner: {
    backgroundColor: theme.colors.dangerSoft,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.danger,
    borderRadius: theme.radii.sm,
    padding: theme.space.lg,
  },
  bannerText: { ...theme.type.bodySmall, color: theme.colors.danger },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md },
  loadingLabel: { ...theme.type.bodySmall, color: theme.colors.inkSoft },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.lg,
    gap: theme.space.sm,
    ...theme.shadow.card,
  },
  cardPressed: { backgroundColor: theme.colors.surfaceSunk },

  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.md,
    alignItems: 'center',
    gap: theme.space.xs,
  },
  statValue: {
    ...theme.type.stat,
    color: theme.colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { ...theme.type.caption, color: theme.colors.inkSoft },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  sectionTitle: { ...theme.type.label, color: theme.colors.inkSoft },

  empty: {
    backgroundColor: theme.colors.surfaceSunk,
    borderRadius: theme.radii.lg,
    padding: theme.space.xl,
    alignItems: 'center',
    gap: theme.space.sm,
  },
  emptyTitle: { ...theme.type.subheading, color: theme.colors.ink, textAlign: 'center' },
  emptyHint: {
    ...theme.type.bodySmall,
    color: theme.colors.inkSoft,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyAction: { marginTop: theme.space.sm },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs + 2,
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs + 1,
  },
  badge_neutral: { backgroundColor: theme.colors.surfaceSunk },
  badge_brand: { backgroundColor: theme.colors.brandSoft },
  badge_recording: { backgroundColor: theme.colors.recordingSoft },
  badgeText: { ...theme.type.label },
  badgeText_neutral: { color: theme.colors.inkMuted },
  badgeText_brand: { color: theme.colors.brand },
  badgeText_recording: { color: theme.colors.recording },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.recording,
  },

  divider: { height: 1, backgroundColor: theme.colors.border },
});
