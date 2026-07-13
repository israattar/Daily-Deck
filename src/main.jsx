import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/amiri-quran'; // Quranic calligraphy for the Prayer section
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
