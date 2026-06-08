// App.jsx — The root component. Controls which page the user sees (Landing vs Dashboard)
// and manages the login/logout flow plus cloud sync preference.
import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { BalanceProvider } from './contexts/BalanceContext';
import { BlurProvider } from './hooks/useBlurContext';
import { setCloudSync, setUserId, setToken, clearToken, api } from './services/api';

function App() {
  // Which screen to show: 'loading' | 'landing' | 'dashboard'
  const [view, setView] = useState('loading');
  // The logged-in user's data (id, email, token), null until they log in
  const [user, setUser] = useState(null);

  useEffect(() => {
    // On mount: check if we just came back from Google OAuth (look for a token in the URL)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search.substring(1));
    const callbackToken = params.get('token');
    const callbackEmail = params.get('email');
    const callbackUserId = params.get('userId');

    if (callbackToken && callbackEmail && callbackUserId) {
      // OAuth success — build a user object and save it
      const fullUser = {
        user_id: callbackUserId,
        email: callbackEmail,
        token: callbackToken
      };
      setUser(fullUser);
      setUserId(callbackUserId);
      setToken(callbackToken);
      // Clean the URL so the token doesn't stay visible in the address bar
      window.history.replaceState({}, document.title, window.location.pathname);
      setView('dashboard');
      return;
    }

    // No OAuth data found — always start fresh, no saved sessions
    setView('landing');
  }, []);

  // Called when the user logs in via email. Saves user data, auth token,
  // fetches their cloud sync preference, then shows the Dashboard.
  const handleLogin = async (userData, tokenData, password) => {
    const fullUser = { 
      ...userData, 
      token: tokenData?.access_token
    };
    setUser(fullUser);
    setUserId(fullUser.user_id);
    if (tokenData?.access_token) {
      setToken(tokenData.access_token);
    }
    localStorage.removeItem(`mirror_onboarded_${fullUser.user_id}`);
    // Ask the server whether this user has cloud sync turned on
    try {
      const res = await api.getCloudSync(fullUser.user_id);
      if (res?.success) {
        setCloudSync(res.cloud_sync);
      }
    } catch (e) {
      // If the server is unreachable, default to cloud sync ON
      setCloudSync(true);
    }
    setView('dashboard');
  };

  // Logs the user out: clears auth token, resets state, returns to landing
  const handleLogout = () => {
    const userId = user?.user_id;
    if (userId) localStorage.removeItem(`mirror_onboarded_${userId}`);
    clearToken();
    setCloudSync(true);
    setUserId(null);
    setUser(null);
    setView('landing');
  };

  // Toggle cloud sync on/off. The new setting will be picked up when Dashboard re-renders.
  const handleCloudSyncChange = (enabled) => {
    setCloudSync(enabled);
  };

  // While checking for OAuth data, show a simple spinning loader
  if (view === 'loading') {
    return (
      <div className="bg-[#050608] h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Render Landing page or Dashboard depending on the current view state
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