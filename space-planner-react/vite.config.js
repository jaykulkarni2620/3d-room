import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const wordpressOrigin = env.VITE_WP_ORIGIN;
  return {
    plugins: [react()],
    base: './',
    server: {
      host: '0.0.0.0',
      proxy: wordpressOrigin ? { '/wp-json': { target: wordpressOrigin, changeOrigin: true } } : undefined,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) return 'three-vendor';
            if (id.includes('/node_modules/@react-three/')) return 'r3f-vendor';
            if (id.includes('/node_modules/react')) return 'react-vendor';
          },
        },
      },
    },
  };
});
