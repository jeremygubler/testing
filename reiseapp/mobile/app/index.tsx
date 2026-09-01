import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/ui/components';

export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  return <Redirect href={status === 'signedIn' ? '/trips' : '/login'} />;
}
