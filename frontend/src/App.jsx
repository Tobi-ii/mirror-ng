import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { BalanceProvider } from './contexts/BalanceContext';
import { BlurProvider } from './hooks/useBlurContext';

function App() {
  const [view, setView] = useState('loading');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('mirror_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setView('dashboard');
      } catch (e) {
        console.error("Failed to parse saved user", e);
        setView('landing');
      }
    } else {
      setView('landing');
    }
  }, []);

  const handleLogin = (userData, tokenData) => {
    const fullUser = { 
      ...userData, 
      token: tokenData?.access_token 
    };
    setUser(fullUser);
    localStorage.setItem('mirror_user', JSON.stringify(fullUser));
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('mirror_user');
    setUser(null);
    setView('landing');
  };

  if (view === 'loading') {
    return (
      <div className="bg-[#050608] h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608]">
      {view === 'landing' && (
        <Landing onLogin={handleLogin} />
      )}
      
      {/* Wrap with both providers - BalanceProvider and BlurProvider */}
      {view === 'dashboard' && user && (
        <BlurProvider>
          <BalanceProvider userId={user.user_id}>
            <Dashboard 
              userId={user.user_id} 
              onLogout={handleLogout} 
            />
          </BalanceProvider>
        </BlurProvider>
      )}
    </div>
  );
}

export default App;