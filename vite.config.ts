import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function resolveCozeBaseUrl(e: Record<string, string>): string {
  const u = e.COZE_BASE_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  const r = (e.COZE_REGION || '').toLowerCase();
  if (r === 'cn' || r === 'china') return 'https://api.coze.cn';
  return 'https://api.coze.com';
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    envPrefix: ['VITE_', 'COZE_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: Number(env.PORT) || 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // 开发时绕过浏览器对 Coze API 的跨域限制；Authorization 由前端请求头原样转发
        '/coze-api': {
          target: resolveCozeBaseUrl(env),
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/coze-api/, ''),
        },
      },
    },
  };
});
