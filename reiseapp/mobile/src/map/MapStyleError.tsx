import { StyleSheet, Text, View } from 'react-native';

import { MAP_STYLE_URL } from '@/config';
import { theme } from '@/ui/theme';
import { styleHost } from './style-status';

/** Covers the black rectangle MapLibre leaves behind when no style arrives. */
export function MapStyleError() {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={styles.title}>Karte nicht geladen</Text>
      <Text style={styles.body}>
        {styleHost(MAP_STYLE_URL)} antwortet nicht. Route und Stops sind gespeichert – nur
        der Kartenhintergrund fehlt.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    padding: theme.space.xl,
    backgroundColor: theme.colors.surfaceSunk,
  },
  title: { ...theme.type.subheading, color: theme.colors.ink },
  body: { ...theme.type.caption, color: theme.colors.inkSoft, textAlign: 'center' },
});
