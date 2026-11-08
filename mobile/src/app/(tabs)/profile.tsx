import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { colors } from '../../components/theme';
import { Button, Card, ErrorText, Input, Row } from '../../components/ui';
import { api, API_URL } from '../../services/api';
import { useAuth } from '../../state/auth';
import { useCart } from '../../state/cart';

export default function Profile() {
  const { user, signOut, setUser } = useAuth();
  const cart = useCart();
  const [name, setName] = useState(user?.fullName ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setUser(await api.updateMe(name.trim()));
      setMsg('Đã lưu.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primaryDark }}>
            {(user.fullName || user.email).charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{user.fullName || 'Khách hàng'}</Text>
        <Text style={{ color: colors.muted }}>{user.email}</Text>
      </Card>

      <Card style={{ gap: 12 }}>
        <Input label="Họ và tên" value={name} onChangeText={setName} placeholder="Nhập họ tên" maxLength={100} />
        <Button title="Lưu thông tin" onPress={save} loading={busy} disabled={!name.trim() || name.trim() === user.fullName} />
        {msg ? <Text style={{ color: colors.success }}>{msg}</Text> : null}
        <ErrorText text={error} />
      </Card>

      <Card>
        <Button title="Yêu cầu hoàn tiền của tôi" variant="ghost" onPress={() => router.push('/refunds')} />
      </Card>

      <Card>
        <Row label="Vai trò" value="Khách hàng" />
        <Row label="Máy chủ" value={API_URL} />
      </Card>

      <Button
        title="Đăng xuất"
        variant="danger"
        onPress={async () => {
          cart.clear();
          await signOut();
          router.replace('/(auth)/login');
        }}
      />
    </ScrollView>
  );
}
