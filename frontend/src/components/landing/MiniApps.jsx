// Ilustrasi mini dashboard di kartu fitur landing page (dekoratif, aria-hidden).
// Isi & angka mengikuti desain prototipe "satisviewww.html".

function TopBar({ judul }) {
  return (
    <div className="flex h-[26px] items-center justify-between rounded-lg bg-white px-2.5 text-[8px] shadow-[0_1px_0_#e3eaf3]">
      <b className="font-bold text-brand-900">SatisView</b>
      <span className="text-ink-muted">{judul}</span>
      <i className="h-1.5 w-8 rounded-full bg-gold" />
    </div>
  );
}

function Bar({ label, w, nilai, gold = false }) {
  return (
    <div className="grid grid-cols-[92px_1fr_30px] items-center gap-2 text-[8px]">
      <span className="truncate text-ink-soft">{label}</span>
      <i className="h-[7px] overflow-hidden rounded-full bg-brand-100">
        <span className={`block h-full rounded-full ${gold ? 'bg-gold' : 'bg-brand'}`} style={{ width: w }} />
      </i>
      <b className="text-right font-bold text-brand-900 tabular">{nilai}</b>
    </div>
  );
}

const Frame = ({ children }) => (
  <div className="flex h-full flex-col gap-2 overflow-hidden rounded-[15px] border border-[#dce6f0] bg-[#f7f9fc] p-[9px]" aria-hidden>
    {children}
  </div>
);

const Subjudul = ({ children }) => <h5 className="mt-1 text-[8px] font-bold text-brand-900">{children}</h5>;

export function MiniIndeks() {
  return (
    <Frame>
      <TopBar judul="Kepuasan Layanan" />
      <div className="rounded-lg bg-[linear-gradient(110deg,#0b2b4b,#14487a)] px-2.5 py-2 text-white">
        <small className="block text-[6px] font-bold tracking-[.12em] text-gold">KELOMPOK RESPONDEN</small>
        <strong className="text-[12px] leading-tight">Mahasiswa</strong>
        <span className="float-right mt-1 text-[7px] text-brand-100">418 responden</span>
      </div>
      <div className="flex gap-1 text-[7px]">
        <b className="rounded-full bg-gold px-2 py-0.5 font-bold text-brand-950">Mahasiswa</b>
        {['Dosen', 'Karyawan', 'Mitra'].map((x) => (
          <span key={x} className="rounded-full bg-white px-2 py-0.5 text-ink-soft">{x}</span>
        ))}
      </div>
      <div className="sv-auto-pan flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['Indeks Total', '77,65', 'Mutu B'],
            ['Responden', '418'],
            ['Aspek', '12'],
          ].map(([a, b, c]) => (
            <div key={a} className="rounded-lg border border-[#e3eaf3] bg-white p-1.5">
              <small className="block text-[6px] text-ink-muted">{a}</small>
              <strong className="text-[12px] font-bold text-brand-900">{b}</strong>
              {c && <em className="block text-[6px] font-semibold text-good not-italic">{c}</em>}
            </div>
          ))}
        </div>
        <Subjudul>Aspek Kuesioner</Subjudul>
        <Bar label="Klinik Kampus" w="84%" nilai="83,75" />
        <Bar label="Perpustakaan" w="82%" nilai="82,50" />
        <Bar label="TIK & Sistem Informasi" w="68%" nilai="68,00" />
        <Bar label="Parkir Kampus" w="63%" nilai="62,75" />
      </div>
    </Frame>
  );
}

export function MiniPrioritas() {
  const rank = [
    ['1', 'Parkir Kampus', 'Tinggi', 'bg-bad-soft text-bad'],
    ['2', 'TIK & Sistem Informasi', 'Sedang', 'bg-gold-100 text-gold-700'],
    ['3', 'Kemahasiswaan', 'Dipantau', 'bg-brand-50 text-brand-700'],
  ];
  return (
    <Frame>
      <TopBar judul="Prioritas Perbaikan" />
      <div className="sv-auto-pan sv-delay-1 flex flex-col gap-1.5">
        {rank.map(([n, a, l, cls]) => (
          <div key={n} className="flex items-center gap-2 rounded-lg border border-[#e3eaf3] bg-white px-2 py-1.5 text-[8px]">
            <b className="grid size-4 place-items-center rounded-md bg-gold text-[7px] font-bold text-brand-950">{n}</b>
            <span className="flex-1 font-semibold text-brand-900">{a}</span>
            <em className={`rounded-full px-1.5 py-0.5 text-[6px] font-bold not-italic ${cls}`}>{l}</em>
          </div>
        ))}
        <Subjudul>Peta Prioritas</Subjudul>
        <div className="relative h-[92px] rounded-lg border border-[#dbe5ef] bg-white bg-[linear-gradient(#eef4f9_1px,transparent_1px),linear-gradient(90deg,#eef4f9_1px,transparent_1px)] bg-[length:25%_25%]">
          <span className="absolute inset-y-0 left-1/2 w-px bg-brand-200" />
          <span className="absolute inset-x-0 top-1/2 h-px bg-brand-200" />
          {[
            ['25%', '30%', 'bg-brand'],
            ['46%', '51%', 'bg-gold'],
            ['78%', '72%', 'bg-bad'],
            ['68%', '61%', 'bg-bad'],
          ].map(([l, t, c]) => (
            <i key={l + t} className={`absolute size-2 -translate-1/2 rounded-full ring-2 ring-white ${c}`} style={{ left: l, top: t }} />
          ))}
        </div>
        <Subjudul>Butir Terendah</Subjudul>
        <Bar label="Tempat parkir cukup" w="43%" nilai="43%" gold />
        <Bar label="Koneksi Wi-Fi memadai" w="56%" nilai="56%" gold />
      </div>
    </Frame>
  );
}

export function MiniPeta() {
  const titik = [
    ['25%', '58%', 'Adm. Akademik', 'bg-brand'],
    ['36%', '68%', 'Kemahasiswaan', 'bg-brand'],
    ['61%', '30%', 'Parkir', 'bg-gold'],
    ['72%', '45%', 'Ruang Kuliah', 'bg-gold'],
    ['80%', '65%', 'Laboratorium', 'bg-gold'],
  ];
  return (
    <Frame>
      <TopBar judul="Peta Persepsi" />
      <div className="flex gap-1 text-[7px]">
        {['Semua Aspek', 'Semua Program Studi', '2D'].map((x) => (
          <b key={x} className="rounded-md bg-brand px-2 py-1 font-semibold text-white">{x}</b>
        ))}
      </div>
      <div className="relative min-h-[150px] flex-1 rounded-lg border border-[#dce6ef] bg-white bg-[linear-gradient(#edf2f7_1px,transparent_1px),linear-gradient(90deg,#edf2f7_1px,transparent_1px)] bg-[length:20%_20%]">
        {titik.map(([l, t, n, c]) => (
          <i key={n} className="absolute -translate-1/2" style={{ left: l, top: t }}>
            <span className={`block size-2.5 rounded-full ring-2 ring-white ${c}`} />
            <small className="absolute top-3 left-1/2 -translate-x-1/2 text-[6px] whitespace-nowrap text-ink-soft not-italic">{n}</small>
          </i>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[7px]">
        <span className="mr-auto text-ink-muted">Stress-1 0,222</span>
        <b className="rounded-md bg-brand px-2 py-0.5 text-white">Grafik</b>
        <b className="rounded-md bg-white px-2 py-0.5 text-ink-soft">Tabel</b>
      </div>
    </Frame>
  );
}

export function MiniKomentar() {
  return (
    <Frame>
      <TopBar judul="Analisis Komentar" />
      <div className="sv-auto-pan sv-delay-2 flex flex-col gap-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['Total komentar', '314'],
            ['Teridentifikasi', '296'],
            ['Topik', '5'],
          ].map(([a, b]) => (
            <div key={a} className="rounded-lg border border-[#e3eaf3] bg-white p-1.5">
              <small className="block text-[6px] text-ink-muted">{a}</small>
              <strong className="text-[12px] font-bold text-brand-900">{b}</strong>
            </div>
          ))}
        </div>
        <Subjudul>Top 5 Topik Komentar</Subjudul>
        <Bar label="Parkir Kampus" w="84%" nilai="210" gold />
        <Bar label="TIK & Sistem Informasi" w="43%" nilai="108" gold />
        <Bar label="Kemahasiswaan" w="40%" nilai="99" gold />
        <Subjudul>Komentar Responden</Subjudul>
        {['“Parkirannya terlalu sempit.”', '“Mohon parkirannya dibicarakan lagi.”'].map((k) => (
          <div key={k} className="flex items-center gap-2 rounded-lg border border-[#e3eaf3] bg-white px-2 py-1.5 text-[7px] text-ink-soft">
            <span className="flex-1">{k}</span>
            <b className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[6px] font-bold text-gold-700">Parkir</b>
          </div>
        ))}
      </div>
    </Frame>
  );
}
