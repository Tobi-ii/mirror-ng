import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { BalanceProvider } from './contexts/BalanceContext';
import { BlurProvider } from './hooks/useBlurContext';
import { setPassword, clearPassword, setCloudSync, setUserId, api } from './services/api';

function App() {
  const [view, setView] = useState('loading');
  const [user, setUser] = useState(null);
  const [emailPassword, setEmailPassword] = useState(null);

  useEffect(() => {
    // Check URL hash fragment for OAuth callback (Google)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search.substring(1));
    const callbackToken = params.get('token');
    const callbackEmail = params.get('email');
    const callbackUserId = params.get('userId');

    if (callbackToken && callbackEmail && callbackUserId) {
      const fullUser = {
        user_id: callbackUserId,
        email: callbackEmail,
        token: callbackToken
      };
      setUser(fullUser);
      window.history.replaceState({}, document.title, window.location.pathname);
      setView('dashboard');
      return;
    }

    // Always start fresh — no localStorage persistence
    setView('landing');
  }, []);

  const handleLogin = async (userData, tokenData, password) => {
    const fullUser = { 
      ...userData, 
      token: tokenData?.access_token
    };
    setUser(fullUser);
    setUserId(fullUser.user_id);
    if (password) {
      setEmailPassword(password);
      setPassword(password);
    }
    // Fetch cloud sync preference
    try {
      const res = await api.getCloudSync(fullUser.user_id);
      if (res?.success) {
        setCloudSync(res.cloud_sync);
      }
    } catch (e) {
      // Default to cloud sync on
      setCloudSync(true);
    }
    setView('dashboard');
  };

  const handleLogout = () => {
    const userId = user?.user_id;
    if (userId) localStorage.removeItem(`mirror_onboarded_${userId}`);
    setEmailPassword(null);
    clearPassword();
    setCloudSync(true);
    setUserId(null);
    setUser(null);
    setView('landing');
  };

  const handleCloudSyncChange = (enabled) => {
    setCloudSync(enabled);
    // Re-render dashboard will pick up the new value
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
      
      {view === 'dashboard' && user && (
        <BlurProvider>
          <BalanceProvider userId={user.user_id}>
            <Dashboard 
              userId={user.user_id}
              emailPassword={emailPassword}
              onLogout={handleLogout}
              onCloudSyncChange={handleCloudSyncChange}
            />
          </BalanceProvider>
        </BlurProvider>
      )}
    </div>
  );
}

export default App;