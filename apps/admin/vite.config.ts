import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const isSandbox =
    mode === 'sandbox' ||
    env.VITE_APP_ENV === 'sandbox' ||
    process.env.APP_ENV === 'sandbox';

  const port = isSandbox ? 5174 : 5173;
  const targetApi = isSandbox ? 'http://127.0.0.1:5001' : 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
    server: {
      port,
      strictPort: true, // Fail closed if assigned port is occupied
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: targetApi,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    define: {
      'import.meta.env.VITE_APP_ENV': JSON.stringify(isSandbox ? 'sandbox' : 'development'),
      'import.meta.env.VITE_API_PORT': JSON.stringify(isSandbox ? '5001' : '5000'),
    },
  };
});
