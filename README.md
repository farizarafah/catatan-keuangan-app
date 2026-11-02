# inputin

## 1. Firebase
1. Buat project di console.firebase.google.com, tambahkan Web App, salin config ke `.env` (lihat `.env.example`).
2. Authentication > Sign-in method > aktifkan **Google**.
3. Firestore Database > buat database, lalu tab **Rules**: tempel isi `firestore.rules` dan Publish.
4. Authentication > Settings > Authorized domains: tambahkan domain Vercel kamu (`xxx.vercel.app`).

## 2. Jalankan lokal
npm install && npm run dev

## 3. Deploy ke Vercel
Push ke GitHub, import di Vercel (framework: Vite), isi 4 Environment Variables `VITE_FB_*`, Deploy.
