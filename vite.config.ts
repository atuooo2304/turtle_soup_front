import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {createCozeDevMiddleware} from './vite/cozeDevMiddleware.ts';
import {createDeepseekDevMiddleware} from './vite/deepseekDevMiddleware.ts';

function resolveCozeBaseUrl(e: Record<string, string>): string {
  const u = e.COZE_BASE_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  const r = (e.COZE_REGION || '').toLowerCase();
  if (r === 'cn' || r === 'china') return 'https://api.coze.cn';
  return 'https://api.coze.com';
}

function resolveDeepseekBaseUrl(e: Record<string, string>): string {
  const u = e.DEEPSEEK_API_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  return 'https://api.deepseek.com';
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const cozePat = env.COZE_TOKEN?.trim() ?? '';
  const cozeBotId = env.COZE_BOT_ID?.trim() ?? '';
  const cozeApiBase = resolveCozeBaseUrl(env);
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim() ?? '';
  const deepseekApiBase = resolveDeepseekBaseUrl(env);

  return {
    /** COZE_TOKEN / COZE_BOT_ID 勿再通过此前缀注入前端；仅用 VITE_* 公开变量 */
    envPrefix: ['VITE_'],
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'coze-dev-api',
        configureServer(server) {
          server.middlewares.use(
            createDeepseekDevMiddleware({apiKey: deepseekKey, apiBase: deepseekApiBase}),
          );
          server.middlewares.use(createCozeDevMiddleware({pat: cozePat, botId: cozeBotId, base: cozeApiBase}));
        },
      },
    ],
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
    },
  };
});
