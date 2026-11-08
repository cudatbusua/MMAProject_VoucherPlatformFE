import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../components/theme';
import { Button, Card, ErrorText, Input } from '../../components/ui';
import { useCountdown } from '../../components/useCountdown';
import { api } from '../../services/api';
import { useAuth } from '../../state/auth';

type Mode = 'otp' | 'password';

export default function Login() {
  const { signIn, user } = useAuth();
  const [mode, setMode] = useState<Mode>('otp');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<string | null>(null);
  const resendLeft = useCountdown(resendAt);

  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user]);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const requestOtp = () =>
    run(async () => {
      const r = await api.requestOtp(email.trim());
      setStep('code');
      setInfo(r.message + ' Mã có hiệu lực ' + Math.round(r.expiresIn / 60) + ' phút.');
      setResendAt(new Date(Date.now() + 60000).toISOString());
    });

  const verify = () => run(async () => signIn(await api.verifyOtp(email.trim(), code.trim())));
  const login = () => run(async () => signIn(await api.login(email.trim(), password)));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>V</Text>
            </View>
            <Text style={styles.title}>Voucher</Text>
            <Text style={styles.subtitle}>Săn voucher ưu đãi, dùng ngay tại cửa hàng</Text>
          </View>

          <Card style={{ gap: 14 }}>
            <View style={styles.tabs}>
              {(['otp', 'password'] as Mode[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setMode(m);
                    setError(null);
                  }}
                  style={[styles.tab, mode === m && styles.tabActive]}
                >
                  <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                    {m === 'otp' ? 'Mã OTP email' : 'Mật khẩu'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Input
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (step === 'code') setStep('email');
              }}
              placeholder="ban@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />

            {mode === 'otp' ? (
              step === 'email' ? (
                <Button title="Gửi mã OTP" onPress={requestOtp} loading={busy} disabled={!emailValid} />
              ) : (
                <>
                  {info ? <Text style={styles.info}>{info}</Text> : null}
                  <Input
                    label="Mã OTP (6 số)"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Button title="Đăng nhập" onPress={verify} loading={busy} disabled={code.length !== 6} />
                  <Button
                    title={resendLeft > 0 ? 'Gửi lại sau ' + resendLeft + 's' : 'Gửi lại mã'}
                    variant="ghost"
                    small
                    onPress={requestOtp}
                    disabled={resendLeft > 0 || busy}
                  />
                </>
              )
            ) : (
              <>
                <Input
                  label="Mật khẩu"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                />
                <Button
                  title="Đăng nhập"
                  onPress={login}
                  loading={busy}
                  disabled={!emailValid || password.length < 8}
                />
              </>
            )}
            <ErrorText text={error} />
          </Card>
          <Text style={styles.note}>
            Lần đầu đăng nhập bằng OTP sẽ tự tạo tài khoản khách hàng. Tài khoản quản trị, thương hiệu và
            nhân viên dùng giao diện web.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.muted, textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: colors.muted, fontWeight: '500' },
  tabTextActive: { color: colors.text, fontWeight: '700' },
  info: { color: colors.success, backgroundColor: colors.successSoft, padding: 10, borderRadius: 8 },
  note: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
