import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 39471,
    strictPort: true,
    fs: {
      // Keep local credentials and uploaded patches out of Vite file serving.
      strict: true,
      allow: ['.'],
      deny: ['.env', '.env.*', '*.{crt,pem,key,pfx,p12,patch,diff}', '**/.git/**', '**/backend/**', '**/.runtime/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:39472',
        changeOrigin: true,
      },
    },
  },
});
