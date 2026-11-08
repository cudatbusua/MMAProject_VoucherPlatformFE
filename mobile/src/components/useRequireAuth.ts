import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../state/auth';

/** Sends the user back to login whenever the session ends (logout or refresh failure). */
export function useRequireAuth() {
  const { user, ready } = useAuth();
  useEffect(() => {
    if (ready && !user) router.replace('/(auth)/login');
  }, [user, ready]);
  return user;
}
