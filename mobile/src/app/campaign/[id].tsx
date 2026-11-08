import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { benefit, date, money, percentOff, typeLabel } from '../../components/format';
import { colors, radius } from '../../components/theme';
import { Badge, Button, Card, Empty, ErrorText, Loading, Row, SectionTitle } from '../../components/ui';
import { api } from '../../services/api';
import { useCart } from '../../state/cart';
import type { Campaign } from '../../types';

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cart = useCart();
  const [c, setC] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api
      .campaign(id)
      .then(setC)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error && !c) return <Empty title="Không mở được voucher" hint={error} />;
  if (!c) return <Loading />;

  const brand = typeof c.brandId === 'object' ? c.brandId : null;
  const inCart = cart.items.find((i) => i.campaignId === c.id)?.quantity ?? 0;
  const maxQty = Math.max(0, Math.min(c.remainingStock, c.limitPerUser - inCart));
  const soldOut = c.remainingStock <= 0;

  function addToCart(goToCart: boolean) {
    if (!c || qty < 1) return;
    cart.add(c, qty);
    setAdded(true);
    if (goToCart) router.push('/(tabs)/cart');
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: c.title }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={styles.hero}>
          {c.image ? (
            <Image source={{ uri: c.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={styles.heroText}>-{percentOff(c.salePrice, c.faceValue)}%</Text>
          )}
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Badge text={typeLabel[c.voucherType]} tone="primary" />
            <Badge text={c.category} />
            {soldOut ? <Badge text="Hết hàng" tone="danger" /> : null}
          </View>
          <Text style={styles.title}>{c.title}</Text>
          {brand ? <Text style={{ color: colors.muted }}>{brand.name}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={styles.price}>{money(c.salePrice)}</Text>
            <Text style={styles.face}>{money(c.faceValue)}</Text>
          </View>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{benefit(c)}</Text>
        </View>

        <Card>
          <Row label="Còn lại" value={Math.max(0, c.remainingStock) + ' / ' + c.totalQuantity} />
          <Row label="Giới hạn mỗi người" value={c.limitPerUser + ' vé'} />
          <Row label="Mở bán đến" value={date(c.saleEndAt)} />
          <Row label="Hạn sử dụng" value={date(c.voucherExpireAt)} />
        </Card>

        {c.description ? (
          <View style={{ gap: 6 }}>
            <SectionTitle>Mô tả</SectionTitle>
            <Text style={styles.body}>{c.description}</Text>
          </View>
        ) : null}
        {c.terms ? (
          <View style={{ gap: 6 }}>
            <SectionTitle>Điều kiện sử dụng</SectionTitle>
            <Text style={styles.body}>{c.terms}</Text>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <SectionTitle>Cửa hàng áp dụng ({c.stores?.length ?? 0})</SectionTitle>
          {c.stores?.map((s) => (
            <Card key={s.id} style={{ padding: 12 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{s.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{s.address}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{qty}</Text>
          <Pressable style={styles.stepBtn} onPress={() => setQty((q) => Math.min(Math.max(1, maxQty), q + 1))}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <Button
          title={added ? 'Đã thêm ✓' : 'Thêm vào giỏ'}
          variant="outline"
          style={{ flex: 1 }}
          disabled={soldOut || maxQty < 1}
          onPress={() => addToCart(false)}
        />
        <Button title="Mua ngay" style={{ flex: 1 }} disabled={soldOut || maxQty < 1} onPress={() => addToCart(true)} />
      </View>
      {maxQty < 1 && !soldOut ? (
        <Text style={styles.limit}>Bạn đã thêm tối đa {c.limitPerUser} vé vào giỏ.</Text>
      ) : null}
      <ErrorText text={error} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 170,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroText: { fontSize: 44, fontWeight: '900', color: colors.primaryDark },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  price: { fontSize: 24, fontWeight: '800', color: colors.primary },
  face: { fontSize: 15, color: colors.muted, textDecorationLine: 'line-through' },
  body: { color: colors.text, lineHeight: 21 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 48,
  },
  stepBtn: { width: 36, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, color: colors.text },
  qty: { minWidth: 24, textAlign: 'center', fontWeight: '700', fontSize: 16 },
  limit: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingBottom: 6, backgroundColor: '#fff' },
});
