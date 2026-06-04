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

  const SESSION_VERSION = 3;

  useEffect(() => {
    // Check URL hash fragment first (OAuth callback), then query params (fallback)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search.substring(1));
    const callbackToken = params.get('token');
    const callbackEmail = params.get('email');
    const callbackUserId = params.get('userId');

    if (callbackToken && callbackEmail && callbackUserId) {
      const fullUser = {
        user_id: callbackUserId,
        email: callbackEmail,
        token: callbackToken,
        _sv: SESSION_VERSION
      };
      setUser(fullUser);
      localStorage.setItem('mirror_user', JSON.stringify(fullUser));
      window.history.replaceState({}, document.title, window.location.pathname);
      setView('dashboard');
      return;
    }

    const savedUser = localStorage.getItem('mirror_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser._sv !== SESSION_VERSION) {
          localStorage.removeItem('mirror_user');
          setView('landing');
          return;
        }
        setUser(parsedUser);
        setUserId(parsedUser.user_id);
        const savedPass = localStorage.getItem('mirror_pass');
        if (savedPass) {
          setEmailPassword(savedPass);
          setPassword(savedPass);
        }
        setView('dashboard');
      } catch (e) {
        setView('landing');
      }
    } else {
      setView('landing');
    }
  }, []);

  const handleLogin = async (userData, tokenData, password) => {
    const fullUser = { 
      ...userData, 
      token: tokenData?.access_token,
      _sv: SESSION_VERSION
    };
    setUser(fullUser);
    localStorage.setItem('mirror_user', JSON.stringify(fullUser));
    setUserId(fullUser.user_id);
    if (password) {
      setEmailPassword(password);
      setPassword(password);
      localStorage.setItem('mirror_pass', password);
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
    localStorage.removeItem('mirror_user');
    localStorage.removeItem('mirror_pass');
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