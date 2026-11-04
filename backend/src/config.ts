export function validateEnvironment(env: Record<string, unknown>) {
  const mode = String(env.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV');
  for (const name of ['JWT_SECRET', 'OTP_SECRET']) {
    const value = String(env[name] ?? '');
    if (value.length < 32 || value.startsWith('replace-with-'))
      throw new Error(name + ' must be a random secret with at least 32 characters.');
  }
  if (env.JWT_SECRET === env.OTP_SECRET) throw new Error('JWT_SECRET and OTP_SECRET must differ.');
  if (!String(env.MONGODB_URI ?? '').startsWith('mongodb')) throw new Error('MONGODB_URI is required.');
  if (!['local', 'brevo'].includes(String(env.MAIL_PROVIDER)))
    throw new Error('MAIL_PROVIDER must be local or brevo.');
  if (env.MAIL_PROVIDER === 'brevo' && (!env.BREVO_API_KEY || !env.MAIL_FROM_EMAIL))
    throw new Error('Brevo key and verified sender email are required.');
  if (env.PAYMENT_MODE !== 'demo')
    throw new Error('This version supports PAYMENT_MODE=demo only. Real payment is not implemented.');
  if (mode === 'production' && (env.MAIL_PROVIDER === 'local' || env.DEMO_PAYMENT_ENABLED === 'true'))
    throw new Error('Local email and demo payment must be disabled in production.');
  const port = Number(env.PORT ?? 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { ...env, NODE_ENV: mode, PORT: port };
}
