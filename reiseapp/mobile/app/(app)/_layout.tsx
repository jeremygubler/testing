import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/ui/components';
import { theme } from '@/ui/theme';

/**
 * Tabs, not a stack.
 *
 * Anything that is about one trip lives inside the trips stack, one level down,
 * so the tab bar stays visible while you move through a journey. The world map
 * gets its own tab as soon as the overview endpoint exists.
 */
export default function AppLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'signedIn') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.ground },
        headerTintColor: theme.colors.ink,
        headerTitleStyle: theme.type.heading,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.colors.ground },
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.inkSoft,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { ...theme.type.caption, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Reisen',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="world"
        options={{
          title: 'Welt',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="earth" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Du',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
