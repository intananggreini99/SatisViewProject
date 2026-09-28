# SatisView Prototype

Prototype dashboard analitik kepuasan stakeholder kampus.

## Teknologi
- HTML5
- TailwindCSS via CDN
- JavaScript ES6+
- D3.js v7 via CDN

## POV Navbar
1. Mahasiswa
2. Dosen
3. Tendik
4. Mitra Kerja Sama Kampus
5. Mitra Pengadaan Barang Kampus

## Fitur prototype
- Responsive Desktop / Laptop / Tablet / Phone
- Government Minimalize dark UI
- KPI: IKM/CSI, responden, area >= 80, prioritas
- Tren kepuasan menggunakan D3.js
- Bar chart kinerja per dimensi
- Analisis tema komentar terbuka
- Prioritas peningkatan layanan
- Rekomendasi dan action plan
- Filter periode dan unit/area
- Tooltip grafik
- Catatan tata kelola: hanya data agregat

## Cara menjalankan
Paling sederhana:
1. Buka `index.html` di browser.
2. Karena TailwindCSS dan D3.js memakai CDN, koneksi internet diperlukan.

Alternatif dengan local server:
```bash
python -m http.server 5500
```
Lalu buka:
`http://localhost:5500`

## Catatan
Angka pada dashboard adalah data sintetis untuk demonstrasi UI/UX. Untuk implementasi produksi, ganti objek `POVS` pada `index.html` dengan data API/database hasil survei yang sudah diagregasi dan dianonimkan.
