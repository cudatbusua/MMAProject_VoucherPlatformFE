import { createHmac, randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
const scrypt = promisify(rawScrypt);
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex');
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(value, salt, 64)) as Buffer;
  return salt + ':' + key.toString('hex');
}
export async function verifyPassword(value: string, encoded?: string) {
  if (!encoded) return false;
  const [salt, hex] = encoded.split(':');
  const key = (await scrypt(value, salt, 64)) as Buffer;
  const stored = Buffer.from(hex, 'hex');
  return stored.length === key.length && timingSafeEqual(stored, key);
}
