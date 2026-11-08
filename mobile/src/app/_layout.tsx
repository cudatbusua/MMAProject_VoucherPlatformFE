import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/theme';
import { AuthProvider } from '../state/auth';
import { CartProvider } from '../state/cart';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerTintColor: colors.text,
              headerStyle: { backgroundColor: '#fff' },
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
              headerBackTitle: 'Quay lại',
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="campaign/[id]" options={{ title: 'Chi tiết voucher' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Đơn hàng' }} />
            <Stack.Screen name="wallet/[id]" options={{ title: 'Voucher của tôi' }} />
            <Stack.Screen name="refunds" options={{ title: 'Yêu cầu hoàn tiền' }} />
          </Stack>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
