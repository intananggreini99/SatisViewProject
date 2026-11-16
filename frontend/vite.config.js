import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Saat development (`npm run dev`), permintaan /api diteruskan ke backend.
// Di Docker, Nginx yang meneruskan /api ke service "backend".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:4000',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
