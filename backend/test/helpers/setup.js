// Aplikasi uji: penyimpanan akun di memori + producer Kafka tiruan.
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/auth/service.js';
import { createMemoryUserStore } from '../../src/auth/users.js';
import { config } from '../../src/config.js';

export const ADMIN = { username: 'admin.uji', nama: 'Admin Uji', peran: 'admin', password: 'RahasiaUji123' };

export function fakeProducer() {
  const sent = [];
  return {
    sent,
    fail: false,
    topic: 'satisview.kuesioner.respons',
    async send(message) {
      if (this.fail) throw new Error('broker tidak tersedia');
      sent.push(message);
      return { partition: 0, offset: String(sent.length - 1) };
    },
    async close() {},
  };
}

export async function startApp({ settings, producer = fakeProducer() } = {}) {
  const store = createMemoryUserStore();
  const auth = createAuthService({ store, settings: { ...config.auth, ...settings } });
  await auth.createUser(ADMIN);
  const app = createApp({ auth, producer });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (username = ADMIN.username, password = ADMIN.password) => {
    const res = await fetch(`${base}/auth/masuk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return { res, body: await res.json() };
  };
  return { server, base, store, auth, producer, login, close: () => new Promise((r) => server.close(r)) };
}
