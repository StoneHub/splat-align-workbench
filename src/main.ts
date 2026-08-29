import { createApp } from './app/App';
import './app/app.css';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing app root');
}

const disposeApp = createApp(root);
window.addEventListener('pagehide', disposeApp, { once: true });
if (import.meta.hot) import.meta.hot.dispose(disposeApp);
