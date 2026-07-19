import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // dev-only convenience: the SPA on :5173 talks to the API on :8788. In production
    // VITE_API_URL is empty and Express serves this build same-origin (no proxy involved).
    proxy: {
      '/api': 'http://localhost:8788',
      '/auth': 'http://localhost:8788',
      '/admin': 'http://localhost:8788',
    },
  },
});
