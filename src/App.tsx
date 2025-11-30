import { useState } from 'react';
import './index.css';
import { AppRouter } from './router/AppRouter';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <AppRouter
      isAuthenticated={isAuthenticated}
      onLogin={() => setIsAuthenticated(true)}
      onLogout={() => setIsAuthenticated(false)}
    />
  );
}

export default App;
