import { Image } from 'react-native';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Campaign } from '../types';
import { benefit, money, percentOff, typeLabel } from './format';
import { colors, radius } from './theme';
import { Badge } from './ui';

export function CampaignCard({ item }: { item: Campaign }) {
  const brand = typeof item.brandId === 'object' ? item.brandId.name : '';
  const soldOut = item.remainingStock <= 0;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/campaign/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.thumb}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={styles.thumbText}>-{percentOff(item.salePrice, item.faceValue)}%</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Badge text={typeLabel[item.voucherType]} tone="primary" />
          {item.category ? <Badge text={item.category} /> : null}
          {soldOut ? <Badge text="Hết hàng" tone="danger" /> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {brand ? <Text style={styles.brand}>{brand}</Text> : null}
        <Text style={styles.benefit} numberOfLines={1}>
          {benefit(item)}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{money(item.salePrice)}</Text>
          <Text style={styles.face}>{money(item.faceValue)}</Text>
          <View style={{ flex: 1 }} />
          {item.distanceKm !== undefined && Number.isFinite(item.distanceKm) ? (
            <Text style={styles.meta}>{item.distanceKm.toFixed(1)} km</Text>
          ) : (
            <Text style={styles.meta}>Còn {Math.max(0, item.remainingStock)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbText: { color: colors.primaryDark, fontWeight: '800', fontSize: 20 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  brand: { fontSize: 13, color: colors.muted },
  benefit: { fontSize: 13, color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary },
  face: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: colors.muted },
});
