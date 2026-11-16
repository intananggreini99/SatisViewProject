import { AlertIcon, InboxIcon, RefreshIcon } from './Icons.jsx';

/** Judul kartu dengan ikon dalam kotak biru muda (mis. "3 Layanan Unggulan"). */
export function TitlePill({ children, icon: Icon, className = '', as: Tag = 'h2' }) {
  return (
    <Tag className={`flex items-center gap-3 text-[17px] leading-snug font-semibold text-brand-900 sm:text-lg ${className}`}>
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
          <Icon size={19} strokeWidth={2.1} />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </Tag>
  );
}

/** Kartu putih membulat dengan bayangan lembut bernuansa biru. */
export function Card({ children, className = '', ...rest }) {
  return (
    <section className={`rounded-[22px] border border-line bg-white shadow-card ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Judul halaman analisis (KPI / Mapping / Text) beserta keterangan singkat. */
export function ViewHeading({ title, children }) {
  return (
    <div className="min-w-0">
      <h2 className="text-xl font-semibold tracking-tight text-brand-900 sm:text-[22px]">{title}</h2>
      {children && <p className="mt-1 max-w-[680px] text-sm leading-relaxed text-ink-soft">{children}</p>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`sv-skeleton ${className}`} aria-hidden />;
}

export function StateMessage({ tone = 'empty', title, children, action }) {
  const Icon = tone === 'error' ? AlertIcon : InboxIcon;
  const toneCls = tone === 'error' ? 'bg-bad-soft text-bad' : 'bg-brand-50 text-brand';
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center" role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`grid size-14 place-items-center rounded-2xl ${toneCls}`}>
        <Icon size={28} />
      </span>
      <h3 className="text-lg font-semibold text-brand-900">{title}</h3>
      {children && <div className="max-w-md text-sm leading-relaxed text-ink-soft">{children}</div>}
      {action}
    </div>
  );
}

export function RetryButton({ onClick, label = 'Coba lagi' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 active:scale-[0.98]"
    >
      <RefreshIcon size={16} /> {label}
    </button>
  );
}

/** Pesan baku untuk status data dari API (no_data / empty / not_found / error). */
export function DataState({ status, error, onRetry, groupLabel, what = 'data' }) {
  if (error) {
    return (
      <StateMessage tone="error" title="Gagal memuat data" action={<RetryButton onClick={onRetry} />}>
        {error.message}
      </StateMessage>
    );
  }
  if (status === 'empty') {
    return (
      <StateMessage title={`Belum ada respons ${groupLabel}`}>
        Kuisioner {groupLabel} belum memiliki jawaban. Dashboard terisi otomatis setelah responden mengisi
        kuisioner dan pipeline Airflow berjalan.
      </StateMessage>
    );
  }
  if (status === 'not_found') {
    return (
      <StateMessage title="Segmen tidak ditemukan">
        Tidak ada {what} untuk pilihan filter ini. Pilih segmen lain atau kembali ke “Semua”.
      </StateMessage>
    );
  }
  return (
    <StateMessage title={`Data ${groupLabel} belum tersedia`}>
      Hasil analisis belum masuk ke database. Pastikan pipeline Airflow (DAG <code>gdrive_to_hdfs</code>) sudah
      dijalankan.
    </StateMessage>
  );
}

/** Tombol kecil bergaya pil garis (dipakai untuk toggle grafik/tabel, zoom, dll). */
export function GhostButton({ children, active = false, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-brand-800 hover:border-brand-200 hover:bg-brand-50'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
