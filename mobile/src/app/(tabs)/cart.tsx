import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { money } from '../../components/format';
import { colors, radius } from '../../components/theme';
import { Button, Card, Empty, ErrorText } from '../../components/ui';
import { api } from '../../services/api';
import { CartItem, useCart } from '../../state/cart';

export default function Cart() {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function checkout() {
    setBusy(true);
    setErrors({});
    const created: string[] = [];
    const failed: Record<string, string> = {};
    // Backend takes one campaign per order, so each cart line becomes its own order.
    for (const item of cart.items) {
      try {
        const order = await api.createOrder(item.campaignId, item.quantity, item.idempotencyKey);
        created.push(order.id);
        cart.remove(item.campaignId);
      } catch (e) {
        failed[item.campaignId] = (e as Error).message;
      }
    }
    setErrors(failed);
    setBusy(false);
    if (created.length === 1 && !Object.keys(failed).length)
      router.push({ pathname: '/order/[id]', params: { id: created[0] } });
    else if (created.length) router.push('/(tabs)/orders');
  }

  if (!cart.items.length)
    return (
      <Empty
        title="Giỏ hàng trống"
        hint="Chọn voucher bạn thích ở tab Khám phá."
        action={<Button title="Khám phá voucher" small onPress={() => router.push('/(tabs)')} />}
      />
    );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cart.items}
        keyExtractor={(i) => i.campaignId}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <Text style={styles.note}>
            Mỗi voucher tạo một đơn riêng và được giữ chỗ 15 phút sau khi đặt.
          </Text>
        }
        renderItem={({ item }) => (
          <CartRow
            item={item}
            error={errors[item.campaignId]}
            onQty={(q) => cart.setQuantity(item.campaignId, q)}
            onRemove={() => cart.remove(item.campaignId)}
          />
        )}
      />
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted }}>Tổng ({cart.count} vé)</Text>
          <Text style={styles.total}>{money(cart.total)}</Text>
        </View>
        <Button title="Đặt hàng" onPress={checkout} loading={busy} style={{ minWidth: 150 }} />
      </View>
    </View>
  );
}

function CartRow({
  item,
  error,
  onQty,
  onRemove,
}: {
  item: CartItem;
  error?: string;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  return (
    <Card style={{ gap: 10 }}>
      <Pressable onPress={() => router.push({ pathname: '/campaign/[id]', params: { id: item.campaignId } })}>
        <Text style={styles.title}>{item.title}</Text>
        {item.brandName ? <Text style={{ color: colors.muted }}>{item.brandName}</Text> : null}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={styles.price}>{money(item.salePrice)}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => onQty(item.quantity - 1)}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{item.quantity}</Text>
          <Pressable style={styles.stepBtn} onPress={() => onQty(item.quantity + 1)}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={{ color: colors.danger, fontWeight: '600' }}>Xóa</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Tối đa {item.limitPerUser} vé mỗi người</Text>
      <ErrorText text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  title: { fontWeight: '700', fontSize: 15, color: colors.text },
  price: { fontWeight: '800', color: colors.primary, fontSize: 16 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: colors.text },
  qty: { minWidth: 22, textAlign: 'center', fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  total: { fontSize: 20, fontWeight: '800', color: colors.text },
});
