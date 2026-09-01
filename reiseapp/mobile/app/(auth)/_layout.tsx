import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/ui/components';

export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'signedIn') return <Redirect href="/trips" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
