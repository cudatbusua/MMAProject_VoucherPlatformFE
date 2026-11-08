import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CampaignCard } from '../../components/CampaignCard';
import { colors } from '../../components/theme';
import { Chip, Empty, ErrorText, Input, Loading } from '../../components/ui';
import { api, SearchParams } from '../../services/api';
import type { Campaign } from '../../types';

const SORTS: { key: NonNullable<SearchParams['sort']>; label: string }[] = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'price', label: 'Giá thấp' },
  { key: 'best', label: 'Bán chạy' },
];
const RADII = [2, 5, 10, 20];
const LIMIT = 20;

export default function Explore() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<SearchParams['sort']>('newest');
  const [categories, setCategories] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (nextPage: number, mode: 'reset' | 'more' | 'refresh') => {
      const id = ++reqId.current;
      if (mode === 'reset') setLoading(true);
      if (mode === 'more') setLoadingMore(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const r = await api.search({
          q: debouncedQ || undefined,
          category,
          sort,
          page: nextPage,
          limit: LIMIT,
          ...(coords ? { ...coords, radiusKm } : {}),
        });
        if (id !== reqId.current) return;
        setItems((prev) => (nextPage === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
        setPage(nextPage);
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [debouncedQ, category, sort, coords, radiusKm],
  );

  useEffect(() => {
    void load(1, 'reset');
  }, [load]);

  async function toggleNearby() {
    if (coords) {
      setCoords(null);
      return;
    }
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Bạn chưa cấp quyền vị trí.');
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      setError('Không lấy được vị trí hiện tại.');
    }
  }

  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <Input value={q} onChangeText={setQ} placeholder="Tìm voucher, món, thương hiệu..." returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip text="Tất cả" active={!category} onPress={() => setCategory(undefined)} />
        {categories.map((c) => (
          <Chip key={c} text={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SORTS.map((s) => (
          <Chip key={s.key} text={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
        <View style={styles.divider} />
        <Chip text={coords ? '📍 Gần tôi ✓' : '📍 Gần tôi'} active={!!coords} onPress={toggleNearby} />
        {coords
          ? RADII.map((r) => (
              <Chip key={r} text={r + ' km'} active={radiusKm === r} onPress={() => setRadiusKm(r)} />
            ))
          : null}
      </ScrollView>
      <ErrorText text={error} />
      {!loading ? <Text style={styles.count}>{total} voucher đang mở bán</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={loading ? [] : items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <CampaignCard item={item} />}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        loading ? (
          <View style={{ height: 240 }}>
            <Loading />
          </View>
        ) : (
          <Empty title="Không tìm thấy voucher" hint="Thử đổi từ khóa, danh mục hoặc bán kính." />
        )
      }
      ListFooterComponent={loadingMore ? <Loading /> : undefined}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !loadingMore && items.length < total) void load(page + 1, 'more');
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} tintColor={colors.primary} />
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  chips: { gap: 8, paddingRight: 16 },
  divider: { width: 1, backgroundColor: colors.border, marginHorizontal: 2 },
  count: { color: colors.muted, fontSize: 13 },
});
