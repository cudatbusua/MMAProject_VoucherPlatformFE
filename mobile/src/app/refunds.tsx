import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { dateTime, money } from '../components/format';
import { refundStatus } from '../components/status';
import { colors } from '../components/theme';
import { Badge, Card, Empty, ErrorText, Loading } from '../components/ui';
import { useFocusFetch } from '../components/useFetch';
import { api } from '../services/api';

export default function Refunds() {
  const { data, error, loading, refreshing, reload } = useFocusFetch(api.myRefunds);
  if (loading) return <Loading />;
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      ListHeaderComponent={<ErrorText text={error} />}
      ListEmptyComponent={<Empty title="Chưa có yêu cầu hoàn tiền" />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
      renderItem={({ item }) => {
        const [label, tone] = refundStatus[item.status];
        return (
          <Pressable onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: item.voucherId } })}>
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }}>{money(item.amount)}</Text>
                <Badge text={label} tone={tone} />
              </View>
              <Text style={{ color: colors.text }}>Lý do: {item.reason}</Text>
              {item.reference ? (
                <Text style={{ color: colors.muted }}>
                  {item.status === 'REJECTED' ? 'Phản hồi: ' : 'Mã tham chiếu: '}
                  {item.reference}
                </Text>
              ) : null}
              <Text style={{ color: colors.muted, fontSize: 12 }}>{dateTime(item.createdAt)}</Text>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}
