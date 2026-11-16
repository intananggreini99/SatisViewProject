# Folder kredensial

Letakkan file kunci **service account** Google Cloud di sini dengan nama
`service-account.json` bila memakai mode akses service account (paling aman).

Langkah singkat:

1. Google Cloud Console → buat project → aktifkan **Google Drive API**.
2. IAM & Admin → Service Accounts → buat service account → tab *Keys* →
   *Add key* → JSON. Simpan sebagai `secrets/service-account.json`.
3. Bagikan folder Drive **Data Responden** dan folder **laporan** ke email
   service account (mis. `satisview@proyek.iam.gserviceaccount.com`) dengan
   akses *Viewer*.

File `*.json` di folder ini diabaikan Git (lihat `.gitignore`) dan di-mount
read-only ke container Airflow di `/opt/satisview/secrets`.
