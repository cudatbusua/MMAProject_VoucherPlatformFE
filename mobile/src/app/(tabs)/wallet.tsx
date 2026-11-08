import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { benefit, date, money } from '../../components/format';
import { voucherStatus } from '../../components/status';
import { colors, radius } from '../../components/theme';
import { Badge, Card, Chip, Empty, ErrorText, Loading } from '../../components/ui';
import { useFocusFetch } from '../../components/useFetch';
import { api } from '../../services/api';
import type { Voucher, VoucherStatus } from '../../types';

const FILTERS: { key?: VoucherStatus; label: string }[] = [
  { label: 'Tất cả' },
  { key: 'ACTIVE', label: 'Còn hiệu lực' },
  { key: 'USED', label: 'Đã dùng' },
  { key: 'REFUND_PENDING', label: 'Chờ hoàn' },
  { key: 'REFUNDED', label: 'Đã hoàn' },
  { key: 'EXPIRED', label: 'Hết hạn' },
];

export default function Wallet() {
  const [status, setStatus] = useState<VoucherStatus | undefined>('ACTIVE');
  const { data, error, loading, refreshing, reload } = useFocusFetch(() => api.wallet(status), [status]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 8 }}
      >
        {FILTERS.map((f) => (
          <Chip key={f.label} text={f.label} active={status === f.key} onPress={() => setStatus(f.key)} />
        ))}
      </ScrollView>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={<ErrorText text={error} />}
          renderItem={({ item }) => <VoucherRow v={item} />}
          ListEmptyComponent={<Empty title="Chưa có voucher" hint="Voucher sẽ vào ví sau khi thanh toán." />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

function VoucherRow({ v }: { v: Voucher }) {
  const [label, tone] = voucherStatus[v.status];
  const pct = v.usageLimit ? v.usedCount / v.usageLimit : 0;
  return (
    <Pressable onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: v.id } })}>
      <Card style={{ gap: 8 }}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={2}>
            {v.title}
          </Text>
          <Badge text={label} tone={tone} />
        </View>
        <Text style={{ color: colors.text }}>{benefit(v)}</Text>
        <View style={styles.top}>
          <Text style={styles.uses}>
            Còn {v.remainingUses}/{v.usageLimit} lượt
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>HSD {date(v.expiresAt)}</Text>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: (1 - pct) * 100 + '%' }]} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Giá trị gói {money(v.totalPrice)}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontWeight: '700', fontSize: 15, color: colors.text },
  uses: { fontWeight: '700', color: colors.primary },
  bar: { height: 6, backgroundColor: colors.bg, borderRadius: radius.sm, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.primary },
});
