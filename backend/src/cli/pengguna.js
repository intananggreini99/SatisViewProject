#!/usr/bin/env node
// Kelola akun pengelola dashboard SatisView.
//
//   docker compose exec backend npm run pengguna -- daftar
//   docker compose exec backend npm run pengguna -- tambah <username> --nama "Nama Lengkap" [--peran pimpinan]
//   docker compose exec backend npm run pengguna -- reset-password <username>
//   docker compose exec backend npm run pengguna -- nonaktifkan <username>
//   docker compose exec backend npm run pengguna -- aktifkan <username>
//
// Password ditanyakan tanpa ditampilkan (atau diisi lewat env SATISVIEW_PASSWORD_BARU).
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { createAuthService } from '../auth/service.js';
import { createPgUserStore, PERAN } from '../auth/users.js';

function tanyaPassword(prompt) {
  if (process.env.SATISVIEW_PASSWORD_BARU) return Promise.resolve(process.env.SATISVIEW_PASSWORD_BARU);
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error('Jalankan dengan terminal interaktif (docker compose exec -it ...) atau isi SATISVIEW_PASSWORD_BARU.'));
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => rl.output.write(rl.stdoutMuted && !s.startsWith(prompt) ? '' : s);
    rl.question(prompt, (jawaban) => {
      rl.output.write('\n');
      rl.close();
      resolve(jawaban);
    });
  });
}

async function passwordBaru() {
  const satu = await tanyaPassword('Password baru (min. 8 karakter, huruf + angka): ');
  if (process.env.SATISVIEW_PASSWORD_BARU) return satu;
  const dua = await tanyaPassword('Ulangi password: ');
  if (satu !== dua) throw new Error('Password tidak sama.');
  return satu;
}

const fmt = (d) => (d ? new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-');

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { nama: { type: 'string' }, peran: { type: 'string', default: 'pengelola' } },
  });
  const [perintah, username] = positionals;
  const store = createPgUserStore();
  const auth = createAuthService({ store });
  try {
    switch (perintah) {
      case 'daftar': {
        const users = await store.list();
        if (!users.length) console.log('Belum ada akun.');
        for (const u of users) {
          console.log(
            `${u.username.padEnd(20)} ${u.peran.padEnd(10)} ${u.aktif ? 'aktif   ' : 'nonaktif'} ${u.nama}  (login terakhir: ${fmt(u.loginTerakhir)})`,
          );
        }
        break;
      }
      case 'tambah': {
        if (!username || !values.nama) throw new Error('Pakai: tambah <username> --nama "Nama Lengkap" [--peran ...]');
        if (!PERAN.includes(values.peran)) throw new Error(`Peran: ${PERAN.join(', ')}`);
        const user = await auth.createUser({ username, nama: values.nama, peran: values.peran, password: await passwordBaru() });
        console.log(`Akun '${user.username}' (${user.peran}) dibuat.`);
        break;
      }
      case 'reset-password': {
        if (!username) throw new Error('Pakai: reset-password <username>');
        await auth.resetPassword(username, await passwordBaru());
        console.log(`Password '${username}' diganti. Sesi lama otomatis tidak berlaku.`);
        break;
      }
      case 'nonaktifkan':
      case 'aktifkan': {
        if (!username) throw new Error(`Pakai: ${perintah} <username>`);
        await auth.setActive(username, perintah === 'aktifkan');
        console.log(`Akun '${username}' ${perintah === 'aktifkan' ? 'diaktifkan' : 'dinonaktifkan'}.`);
        break;
      }
      default:
        console.log('Perintah: daftar | tambah <username> --nama "..." [--peran admin|pimpinan|pengelola] | reset-password <username> | nonaktifkan <username> | aktifkan <username>');
        process.exitCode = perintah ? 1 : 0;
    }
  } catch (error) {
    console.error(`Gagal: ${error.code === '23505' ? 'username sudah dipakai.' : error.message}`);
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main();
