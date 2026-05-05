import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {exchangeTicketFromUrl} from './lib/authSession';
import {isWeChatMiniProgramWebView} from './lib/wechatEnv';
import './index.css';

if (typeof document !== 'undefined') {
  document.title = isWeChatMiniProgramWebView() ? '' : '海龟汤';
}

void exchangeTicketFromUrl().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
