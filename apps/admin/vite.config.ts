import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const isSandbox =
    mode === 'sandbox' ||
    env.VITE_APP_ENV === 'sandbox' ||
    process.env.APP_ENV === 'sandbox';

  const port = isSandbox ? 5174 : 5173;

  // Configurable proxy target with fallback to local defaults
  // In sandbox mode, strictly target local sandbox API on 5001 unless explicitly overridden with a sandbox target
  const defaultTarget = isSandbox ? 'http://127.0.0.1:5001' : 'http://127.0.0.1:5000';
  const rawTarget = isSandbox
    ? (env.VITE_SANDBOX_API_URL || (env.VITE_API_TARGET_URL && !env.VITE_API_TARGET_URL.includes('onrender.com') ? env.VITE_API_TARGET_URL : defaultTarget))
    : (env.VITE_API_TARGET_URL || env.VITE_PROXY_TARGET || process.env.VITE_API_TARGET_URL || process.env.VITE_PROXY_TARGET || defaultTarget);

  // Strip trailing '/api' and '/' to ensure Vite proxy does not duplicate '/api'
  let targetApi = rawTarget.trim();
  if (targetApi.endsWith('/api')) {
    targetApi = targetApi.slice(0, -4);
  }
  if (targetApi.endsWith('/')) {
    targetApi = targetApi.slice(0, -1);
  }

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
      'import.meta.env.VITE_APP_ENV': JSON.stringify(isSandbox ? 'sandbox' : (env.VITE_APP_ENV || 'development')),
      'import.meta.env.VITE_API_PORT': JSON.stringify(isSandbox ? '5001' : '5000'),
    },
  };
});
