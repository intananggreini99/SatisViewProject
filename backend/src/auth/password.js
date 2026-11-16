// Hash password dengan scrypt (bawaan Node, tanpa dependensi native).
// Format tersimpan: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Password minimal ${PASSWORD_MIN} karakter.`;
  }
  if (password.length > PASSWORD_MAX) return `Password maksimal ${PASSWORD_MAX} karakter.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password harus memuat huruf dan angka.';
  }
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password.slice(0, PASSWORD_MAX), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Dipakai saat username tidak ditemukan agar waktu respons tetap setara.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('dummy-password-0');
  await verifyPassword(password ?? '', dummyHash);
  return false;
}
