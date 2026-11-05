import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo: Vite en :5173 con proxy de /api al backend Express en :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
