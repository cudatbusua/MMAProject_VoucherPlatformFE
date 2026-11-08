import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { benefit, date, dateTime, money, typeLabel } from '../../components/format';
import { QrCode } from '../../components/QrCode';
import { voucherStatus } from '../../components/status';
import { colors, radius } from '../../components/theme';
import { Badge, Button, Card, Empty, ErrorText, Input, Loading, Row, SectionTitle } from '../../components/ui';
import { mmss, useCountdown } from '../../components/useCountdown';
import { useFocusFetch } from '../../components/useFetch';
import { api } from '../../services/api';
import type { RedeemCode } from '../../types';

const DAY = 86400000;

export default function WalletItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: v, setData, error, loading } = useFocusFetch(() => api.walletItem(id), [id]);
  const [code, setCode] = useState<RedeemCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [reason, setReason] = useState('');
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const left = useCountdown(code?.expiresAt);
  const codeLive = !!code && left > 0;

  // While a code is on screen, poll so the remaining-uses counter updates as staff confirm each use.
  useEffect(() => {
    if (!codeLive) return;
    const t = setInterval(() => {
      api
        .walletItem(id)
        .then((next) => {
          setData(next);
          if (next.status !== 'ACTIVE') setCode(null);
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [codeLive, id, setData]);

  if (loading) return <Loading />;
  if (!v) return <Empty title="Không tìm thấy voucher" hint={error ?? undefined} />;

  async function generate() {
    setBusy(true);
    setActionError(null);
    try {
      setCode(await api.redeemToken(v!.id));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    setBusy(true);
    setActionError(null);
    try {
      await api.requestRefund(v!.id, reason.trim());
      setRefundMsg('Đã gửi yêu cầu hoàn tiền. Quản trị viên sẽ xác nhận thủ công.');
      setShowRefund(false);
      setCode(null);
      setData(await api.walletItem(v!.id));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [label, tone] = voucherStatus[v.status];
  const usable = v.status === 'ACTIVE' && v.remainingUses > 0 && new Date(v.expiresAt).getTime() > Date.now();
  const refundable =
    v.status === 'ACTIVE' &&
    v.usedCount === 0 &&
    Date.now() - new Date(v.createdAt).getTime() <= 7 * DAY &&
    new Date(v.expiresAt).getTime() - Date.now() >= 3 * DAY;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
      <Card style={{ gap: 8 }}>
        <View style={styles.between}>
          <Badge text={typeLabel[v.voucherType]} tone="primary" />
          <Badge text={label} tone={tone} />
        </View>
        <Text style={styles.title}>{v.title}</Text>
        <Text style={{ color: colors.text }}>{benefit(v)}</Text>
        <View style={styles.usesBox}>
          <Text style={styles.usesBig}>
            {v.remainingUses}
            <Text style={styles.usesSmall}>/{v.usageLimit}</Text>
          </Text>
          <Text style={{ color: colors.muted }}>lượt còn lại</Text>
        </View>
      </Card>

      {usable ? (
        <Card style={{ alignItems: 'center', gap: 12 }}>
          {codeLive && code ? (
            <>
              <Text style={{ color: colors.muted, textAlign: 'center' }}>
                Đưa mã cho nhân viên cửa hàng quét. Mỗi lần xác nhận trừ 1 lượt.
              </Text>
              <View style={styles.qrWrap}>
                <QrCode value={code.qrPayload} size={220} />
              </View>
              <Text style={{ color: colors.muted }}>hoặc đọc mã OTP</Text>
              <Text style={styles.otp}>{code.otpCode.replace(/(\d{3})(\d{3})/, '$1 $2')}</Text>
              <Text style={{ color: left <= 10 ? colors.danger : colors.warning, fontWeight: '700' }}>
                Hết hạn sau {mmss(left)}
              </Text>
              <Button title="Làm mới mã" variant="outline" small onPress={generate} loading={busy} />
            </>
          ) : (
            <>
              <Text style={{ color: colors.muted, textAlign: 'center' }}>
                {code ? 'Mã đã hết hạn. Tạo mã mới để tiếp tục sử dụng; số lượt không thay đổi.' : 'Tạo mã QR/OTP khi bạn đang ở quầy thanh toán. Mã có hiệu lực 60 giây.'}
              </Text>
              <Button title={code ? 'Tạo mã mới' : 'Tạo mã sử dụng'} onPress={generate} loading={busy} style={{ alignSelf: 'stretch' }} />
            </>
          )}
        </Card>
      ) : null}

      {refundMsg ? <Text style={styles.success}>{refundMsg}</Text> : null}
      <ErrorText text={actionError} />

      <Card>
        <Row label="Giá trị gói" value={money(v.totalPrice)} />
        <Row label="Giá mỗi vé" value={money(v.salePrice)} />
        <Row label="Đã dùng" value={v.usedCount + ' lượt'} />
        <Row label="Hạn sử dụng" value={date(v.expiresAt)} />
        <Row label="Ngày cấp" value={dateTime(v.createdAt)} />
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>Cửa hàng áp dụng</SectionTitle>
        {v.stores.map((s) => (
          <Card key={s.id} style={{ padding: 12 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>{s.name}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>{s.address}</Text>
          </Card>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Lịch sử sử dụng ({v.redemptions.length})</SectionTitle>
        {v.redemptions.length ? (
          v.redemptions.map((r) => (
            <Card key={r.id} style={{ padding: 12, gap: 2 }}>
              <View style={styles.between}>
                <Text style={{ fontWeight: '700', color: colors.text }}>Lượt {r.sequence}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{dateTime(r.createdAt)}</Text>
              </View>
              <Text style={{ color: colors.muted }}>
                {r.method} · Hóa đơn {money(r.billAmount)} · Giảm {money(r.discountAmount)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {v.stores.find((s) => s.id === r.storeId)?.name ?? ''} · còn {r.remainingAfter} lượt
              </Text>
            </Card>
          ))
        ) : (
          <Text style={{ color: colors.muted }}>Chưa sử dụng lượt nào.</Text>
        )}
      </View>

      {refundable ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle>Hoàn tiền</SectionTitle>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Hoàn toàn bộ {money(v.totalPrice)} khi chưa dùng lượt nào, trong 7 ngày kể từ khi thanh toán.
          </Text>
          {showRefund ? (
            <>
              <Input
                label="Lý do"
                value={reason}
                onChangeText={setReason}
                placeholder="Nhập lý do (ít nhất 3 ký tự)"
                multiline
                maxLength={500}
              />
              <Button title="Gửi yêu cầu hoàn" variant="danger" onPress={refund} loading={busy} disabled={reason.trim().length < 3} />
              <Button title="Đóng" variant="ghost" small onPress={() => setShowRefund(false)} />
            </>
          ) : (
            <Button title="Yêu cầu hoàn tiền" variant="outline" onPress={() => setShowRefund(true)} />
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  usesBox: { alignItems: 'center', paddingVertical: 8 },
  usesBig: { fontSize: 40, fontWeight: '900', color: colors.primary },
  usesSmall: { fontSize: 20, fontWeight: '700', color: colors.muted },
  qrWrap: { padding: 12, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  otp: { fontSize: 34, fontWeight: '800', letterSpacing: 6, color: colors.text },
  success: { color: colors.success, backgroundColor: colors.successSoft, padding: 12, borderRadius: 8 },
});
