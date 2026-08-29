import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/ui/components';
import { theme } from '@/ui/theme';

export default function AppLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
