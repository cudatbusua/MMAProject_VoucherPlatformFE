import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { benefit, date, dateTime, money, typeLabel } from '../../components/format';
import { orderStatus } from '../../components/status';
import { colors } from '../../components/theme';
import { Badge, Button, Card, Empty, ErrorText, Loading, Row } from '../../components/ui';
import { mmss, useCountdown } from '../../components/useCountdown';
import { useFocusFetch } from '../../components/useFetch';
import { api } from '../../services/api';
import type { Order } from '../../types';

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message)) onYes();
    return;
  }
  Alert.alert('Xác nhận', message, [
    { text: 'Không', style: 'cancel' },
    { text: 'Đồng ý', style: 'destructive', onPress: onYes },
  ]);
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, setData, error, loading } = useFocusFetch(() => api.order(id), [id]);
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const left = useCountdown(order?.status === 'PENDING' ? order.expiresAt : null);

  if (loading) return <Loading />;
  if (!order) return <Empty title="Không tìm thấy đơn hàng" hint={error ?? undefined} />;

  async function pay() {
    setBusy('pay');
    setActionError(null);
    try {
      const r = await api.simulatePayment(order!.id, true);
      const updated = 'order' in r ? r.order : (r as Order);
      setData(updated);
      setMessage('message' in r ? r.message : 'Thanh toán thành công.');
    } catch (e) {
      setActionError((e as Error).message);
      api.order(order!.id).then(setData).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    setActionError(null);
    try {
      setData(await api.cancelOrder(order!.id));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const [label, tone] = orderStatus[order.status];
  const s = order.snapshot;
  const pending = order.status === 'PENDING' && left > 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Badge text={typeLabel[s.voucherType]} tone="primary" />
          <Badge text={label} tone={tone} />
        </View>
        <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text }}>{s.title}</Text>
        <Text style={{ color: colors.text }}>{benefit(s)}</Text>
      </Card>

      <Card>
        <Row label="Số vé" value={order.quantity} />
        <Row label="Đơn giá" value={money(order.unitPrice)} />
        <Row label="Tổng tiền" value={money(order.totalAmount)} />
        <Row label="Đặt lúc" value={dateTime(order.createdAt)} />
        <Row label="Hạn dùng voucher" value={date(s.voucherExpireAt)} />
        <Row label="Mã đơn" value={order.id.slice(-8).toUpperCase()} />
      </Card>

      {order.status === 'PENDING' ? (
        <Card style={{ gap: 12, borderColor: colors.warning }}>
          <Text style={{ color: left > 0 ? colors.warning : colors.danger, fontWeight: '700', textAlign: 'center' }}>
            {left > 0 ? 'Thời gian giữ chỗ còn ' + mmss(left) : 'Đơn đã hết thời gian giữ chỗ'}
          </Text>
          <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>
            Đây là thanh toán DEMO, không phát sinh giao dịch tiền thật.
          </Text>
          <Button
            title={'Thanh toán demo ' + money(order.totalAmount)}
            onPress={pay}
            loading={busy === 'pay'}
            disabled={!pending || !!busy}
          />
          <Button
            title="Hủy đơn"
            variant="ghost"
            onPress={() => confirm('Hủy đơn này và trả lại vé giữ chỗ?', cancel)}
            loading={busy === 'cancel'}
            disabled={!!busy}
          />
        </Card>
      ) : null}

      {message ? (
        <Text style={{ color: colors.success, backgroundColor: colors.successSoft, padding: 12, borderRadius: 8 }}>
          {message}
        </Text>
      ) : null}
      <ErrorText text={actionError} />

      {order.status === 'FULFILLED' ? (
        <Button title="Xem voucher trong ví" onPress={() => router.push('/(tabs)/wallet')} />
      ) : null}
    </ScrollView>
  );
}
