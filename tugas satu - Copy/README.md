# Buku Tamu Digital

Versi tamu mengirim catatan ke Supabase; versi admin menggunakan akun Supabase Auth untuk menambahkan catatan, mengubah status, menghapus, memvalidasi tiket hadir, dan mengunduh data.

Setiap catatan mendapat token tiket acak. Tautan undangan membuka halaman dengan QR tiket unik; admin dapat menampilkan QR per tamu atau memindainya menggunakan kamera laptop. Validasi dicatat di database dan QR yang telah dipakai tidak bisa dipakai lagi.

Tombol WhatsApp membuka chat dengan undangan dan tautan QR yang sudah disiapkan. Admin/pengirim masih harus menekan **Kirim** di WhatsApp; pengiriman otomatis memerlukan WhatsApp Business API. Pastikan nomor WhatsApp memakai nomor Indonesia yang valid.

## Menyiapkan Supabase

1. Buat proyek di Supabase, lalu buka **SQL Editor** dan jalankan seluruh isi `supabase-setup.sql`.
2. Di **Authentication → Users**, buat akun admin. Pendaftaran publik tidak diperlukan.
3. Salin UUID akun admin dari daftar Users. Di SQL Editor jalankan:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-AKUN-ADMIN');
   ```

4. Buka **Project Settings → API**. Masukkan **Project URL** dan **anon/public key** ke `assets/js/config.js`. Jangan pernah memasukkan `service_role` key ke aplikasi browser.
5. Atur `eventName`, `eventDate`, dan `eventLocation` di `assets/js/config.js`. Informasi ini akan dicantumkan pada undangan WhatsApp.
6. Jalankan kembali seluruh `supabase-setup.sql` di SQL Editor. Script menambahkan kolom tiket untuk tabel yang sudah ada dan membuat RPC validasi QR satu kali. Setelah itu, pastikan akun admin ada di tabel `admin_users`.
7. Publikasikan folder proyek ini ke hosting web statis (misalnya GitHub Pages, Netlify, atau hosting sekolah). Jangan membagikan halaman melalui `file://`.
8. Buka URL publik menggunakan HTTPS, masuk melalui **Versi Admin**, lalu input data beserta nomor WhatsApp. Tekan **Kirim undangan WhatsApp** pada data tamu; tamu membuka tautan untuk menampilkan QR.
9. Di lokasi acara, buka **Validasi Kehadiran → Buka kamera** pada laptop, izinkan akses kamera, lalu arahkan QR tamu ke kamera. Setelah valid, catatan ditandai hadir dan QR tidak dapat digunakan ulang.

Kamera hanya berjalan pada HTTPS atau localhost. Pastikan QR tamu ditampilkan pada layar ponsel dengan cukup terang dan kamera dapat fokus. Tabel mengizinkan pengunjung mengirim catatan baru saja. Hanya UUID yang terdaftar di `admin_users` yang dapat membaca, mengubah, menghapus, atau memvalidasi tiket. Jangan mengaktifkan pendaftaran admin publik.

## Menjalankan lokal

Buka folder melalui server web lokal (bukan `file://`), misalnya fitur Live Server di VS Code. URL Supabase harus sudah diisi agar pengiriman data dapat dilakukan.
