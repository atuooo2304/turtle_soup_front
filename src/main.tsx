import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {isWeChatMiniProgramWebView} from './lib/wechatEnv';
import './index.css';

if (typeof document !== 'undefined') {
  document.title = isWeChatMiniProgramWebView() ? '' : '海龟汤';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
