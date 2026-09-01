import { Stack } from 'expo-router';

import { theme } from '@/ui/theme';

/** Everything about a single trip stacks inside the Reisen tab. */
export default function TripsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.ground },
        headerTintColor: theme.colors.ink,
        headerTitleStyle: theme.type.heading,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.ground },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Reisen' }} />
      <Stack.Screen name="new" options={{ title: 'Neue Reise', presentation: 'modal' }} />
    </Stack>
  );
}
