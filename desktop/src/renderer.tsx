import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App/App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root container not found');
}

ReactDOM.createRoot(rootElement).render(<App />);
