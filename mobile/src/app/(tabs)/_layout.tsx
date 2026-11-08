import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { colors } from '../../components/theme';
import { useRequireAuth } from '../../components/useRequireAuth';
import { useCart } from '../../state/cart';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }) => (
    <Ionicons name={name} color={typeof color === "string" ? color : undefined} size={size} />
  );

export default function TabsLayout() {
  useRequireAuth();
  const { count } = useCart();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Khám phá', tabBarIcon: icon('compass-outline') }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Giỏ hàng',
          tabBarIcon: icon('cart-outline'),
          tabBarBadge: count > 0 ? count : undefined,
        }}
      />
      <Tabs.Screen name="orders" options={{ title: 'Đơn hàng', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="wallet" options={{ title: 'Ví voucher', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Tài khoản', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
