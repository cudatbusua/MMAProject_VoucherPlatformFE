import { Redirect } from 'expo-router';
import { Loading } from '../components/ui';
import { useAuth } from '../state/auth';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return <Redirect href={user ? '/(tabs)' : '/(auth)/login'} />;
}
