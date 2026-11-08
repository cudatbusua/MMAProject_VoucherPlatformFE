import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { dateTime, money } from '../../components/format';
import { orderStatus } from '../../components/status';
import { colors } from '../../components/theme';
import { Badge, Card, Empty, ErrorText, Loading } from '../../components/ui';
import { mmss, useCountdown } from '../../components/useCountdown';
import { useFocusFetch } from '../../components/useFetch';
import { api } from '../../services/api';
import type { Order } from '../../types';

export default function Orders() {
  const { data, error, loading, refreshing, reload } = useFocusFetch(api.myOrders);
  if (loading) return <Loading />;
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      ListHeaderComponent={<ErrorText text={error} />}
      renderItem={({ item }) => <OrderRow order={item} />}
      ListEmptyComponent={<Empty title="Chưa có đơn hàng" hint="Đơn hàng sẽ xuất hiện sau khi bạn đặt mua." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
    />
  );
}

function OrderRow({ order }: { order: Order }) {
  const [label, tone] = orderStatus[order.status];
  const left = useCountdown(order.status === 'PENDING' ? order.expiresAt : null);
  return (
    <Pressable onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
      <Card style={{ gap: 6 }}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {order.snapshot.title}
          </Text>
          <Badge text={label} tone={tone} />
        </View>
        <Text style={{ color: colors.muted }}>
          {order.quantity} vé × {money(order.unitPrice)} · {dateTime(order.createdAt)}
        </Text>
        <View style={styles.top}>
          <Text style={styles.total}>{money(order.totalAmount)}</Text>
          {order.status === 'PENDING' ? (
            <Text style={{ color: left > 0 ? colors.warning : colors.danger, fontWeight: '600' }}>
              {left > 0 ? 'Giữ chỗ còn ' + mmss(left) : 'Hết thời gian giữ chỗ'}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontWeight: '700', fontSize: 15, color: colors.text },
  total: { fontWeight: '800', fontSize: 16, color: colors.text },
});
