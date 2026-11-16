// Login pengelola dashboard & verifikasi token JWT (HS256).
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { burnPasswordCheck, checkPasswordPolicy, hashPassword, verifyPassword } from './password.js';
import { PERAN, USERNAME_PATTERN } from './users.js';

const GENERIC_FAIL = 'Username atau password salah.';
const LOCKED = 'Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.';

export const normalizeUsername = (value) => String(value ?? '').trim().toLowerCase();
const passwordVersion = (user) => Math.floor(new Date(user.passwordDiubah).getTime() / 1000);

const publicUser = (user) => ({ username: user.username, nama: user.nama, peran: user.peran });

export function createAuthService({ store, settings = config.auth, now = () => Date.now() }) {
  // Cache singkat status akun agar setiap permintaan dashboard tidak selalu ke database.
  const statusCache = new Map();
  const STATUS_TTL_MS = 60_000;

  function signToken(user) {
    const token = jwt.sign(
      { nama: user.nama, peran: user.peran, pv: passwordVersion(user) },
      settings.jwtSecret,
      {
        algorithm: 'HS256',
        subject: user.username,
        issuer: settings.issuer,
        audience: settings.audience,
        expiresIn: settings.jwtTtlSeconds,
      },
    );
    return { token, kedaluwarsa: new Date(now() + settings.jwtTtlSeconds * 1000).toISOString() };
  }

  async function login(usernameRaw, password) {
    const username = normalizeUsername(usernameRaw);
    if (!USERNAME_PATTERN.test(username) || typeof password !== 'string' || !password) {
      await burnPasswordCheck(password);
      throw new HttpError(401, GENERIC_FAIL);
    }
    const user = await store.findByUsername(username);
    if (!user || !user.aktif) {
      await burnPasswordCheck(password);
      throw new HttpError(401, GENERIC_FAIL);
    }
    if (user.terkunciSampai && user.terkunciSampai.getTime() > now()) {
      throw new HttpError(429, LOCKED);
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const updated = await store.recordFailure(user.id, {
        maxFailed: settings.maxFailedLogins,
        lockMinutes: settings.lockMinutes,
      });
      if (updated?.terkunciSampai && updated.terkunciSampai.getTime() > now()) throw new HttpError(429, LOCKED);
      throw new HttpError(401, GENERIC_FAIL);
    }
    await store.recordSuccess(user.id);
    statusCache.delete(username);
    return { ...signToken(user), pengguna: publicUser(user) };
  }

  async function currentStatus(username) {
    const cached = statusCache.get(username);
    if (cached && now() - cached.at < STATUS_TTL_MS) return cached.value;
    const user = await store.findByUsername(username);
    const value = user ? { aktif: user.aktif, pv: passwordVersion(user), user: publicUser(user) } : null;
    statusCache.set(username, { at: now(), value });
    return value;
  }

  /** Verifikasi header "Authorization: Bearer <token>"; hasil: data pengguna. */
  async function authenticate(header) {
    const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header ?? '');
    if (!match) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
    let claims;
    try {
      claims = jwt.verify(match[1], settings.jwtSecret, {
        algorithms: ['HS256'],
        issuer: settings.issuer,
        audience: settings.audience,
      });
    } catch (error) {
      const expired = error?.name === 'TokenExpiredError';
      throw new HttpError(401, expired ? 'Sesi Anda telah berakhir. Silakan masuk kembali.' : 'Sesi tidak valid. Silakan masuk kembali.');
    }
    const status = await currentStatus(claims.sub);
    if (!status || !status.aktif || status.pv !== claims.pv) {
      throw new HttpError(401, 'Sesi tidak berlaku lagi. Silakan masuk kembali.');
    }
    return { ...status.user, kedaluwarsa: new Date(claims.exp * 1000).toISOString() };
  }

  function middleware() {
    return async (req, res, next) => {
      try {
        req.user = await authenticate(req.get('authorization'));
        next();
      } catch (error) {
        if (error instanceof HttpError) {
          res.set('WWW-Authenticate', 'Bearer realm="satisview"');
          return res.status(error.status).json({ error: error.message });
        }
        next(error);
      }
    };
  }

  /** Buat akun baru (dipakai bootstrap admin & CLI). */
  async function createUser({ username: raw, nama, peran = 'pengelola', password }) {
    const username = normalizeUsername(raw);
    if (!USERNAME_PATTERN.test(username)) {
      throw new HttpError(400, 'Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.');
    }
    if (!PERAN.includes(peran)) throw new HttpError(400, `Peran harus salah satu dari: ${PERAN.join(', ')}.`);
    const nameClean = String(nama ?? '').trim();
    if (nameClean.length < 2 || nameClean.length > 100) throw new HttpError(400, 'Nama 2–100 karakter.');
    const policy = checkPasswordPolicy(password);
    if (policy) throw new HttpError(400, policy);
    return store.create({ username, nama: nameClean, peran, passwordHash: await hashPassword(password) });
  }

  async function resetPassword(raw, password) {
    const policy = checkPasswordPolicy(password);
    if (policy) throw new HttpError(400, policy);
    const user = await store.setPassword(normalizeUsername(raw), await hashPassword(password));
    if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan.');
    statusCache.delete(user.username);
    return user;
  }

  async function setActive(raw, aktif) {
    const user = await store.setActive(normalizeUsername(raw), aktif);
    if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan.');
    statusCache.delete(user.username);
    return user;
  }

  /** Akun admin awal dari SATISVIEW_ADMIN_USERNAME/PASSWORD (tidak menimpa akun yang ada). */
  async function bootstrapAdmin(bootstrap = settings.bootstrap) {
    if (!bootstrap?.username || !bootstrap?.password) return { status: 'lewati' };
    const existing = await store.findByUsername(normalizeUsername(bootstrap.username));
    if (existing) return { status: 'sudah_ada', username: existing.username };
    const user = await createUser({ ...bootstrap, peran: 'admin' });
    return { status: 'dibuat', username: user.username };
  }

  return { login, authenticate, middleware, createUser, resetPassword, setActive, bootstrapAdmin, signToken };
}
