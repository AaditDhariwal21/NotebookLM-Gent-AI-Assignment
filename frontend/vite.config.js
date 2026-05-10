import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the backend so the React app can use same-origin URLs.
// The backend port matches backend/.env (default 8787).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
