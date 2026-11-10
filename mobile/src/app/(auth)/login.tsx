import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../components/theme';
import { Button, Card, ErrorText, Input } from '../../components/ui';
import { useCountdown } from '../../components/useCountdown';
import { api } from '../../services/api';
import { useAuth } from '../../state/auth';

/** Customers sign in with an email OTP only (no password). */
export default function Login() {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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
      setCode('');
      setInfo(r.message + ' Mã có hiệu lực ' + Math.round(r.expiresIn / 60) + ' phút.');
      setResendAt(new Date(Date.now() + 60000).toISOString());
    });

  const verify = () => run(async () => signIn(await api.verifyOtp(email.trim(), code.trim())));

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
            <View style={{ gap: 4 }}>
              <Text style={styles.cardTitle}>Đăng nhập bằng email</Text>
              <Text style={styles.cardHint}>Nhập email, chúng tôi gửi mã OTP 6 số để đăng nhập. Không cần mật khẩu.</Text>
            </View>

            <Input
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (step === 'code') {
                  setStep('email');
                  setInfo(null);
                }
              }}
              placeholder="ban@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />

            {step === 'email' ? (
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
            )}
            <ErrorText text={error} />
          </Card>
          <Text style={styles.note}>
            Lần đầu đăng nhập sẽ tự tạo tài khoản khách hàng. Tài khoản quản trị, thương hiệu và nhân viên dùng
            giao diện web.
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
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  info: { color: colors.success, backgroundColor: colors.successSoft, padding: 10, borderRadius: 8 },
  note: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
