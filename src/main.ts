import { createApp } from './app/App';
import './app/app.css';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing app root');
}

createApp(root);
