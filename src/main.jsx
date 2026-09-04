import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/amiri-quran'; // Quranic calligraphy for the Prayer section
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

// Offline shell — only on the phone, and only where the browser allows it
// (HTTPS or localhost). Inside Electron there is nothing to cache.
if (window.__DECK_REMOTE__ && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No offline shell — the app still works whenever the laptop is up.
    });
  });
}
