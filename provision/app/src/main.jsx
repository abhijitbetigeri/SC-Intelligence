import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Login from './views/Login.jsx';
import { getToken, clearToken, me } from './lib/auth.js';
import './index.css';

function Root() {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    if (!getToken()) { setState({ status: 'anon', user: null }); return; }
    me().then(({ user }) => setState({ status: 'auth', user }))
      .catch(() => { clearToken(); setState({ status: 'anon', user: null }); });
  }, []);

  if (state.status === 'loading') {
    return <div className="min-h-screen grid place-items-center t-mut">Loading…</div>;
  }
  if (state.status === 'anon') {
    return <Login onAuthed={(user) => setState({ status: 'auth', user })} />;
  }
  return <App user={state.user} onSignOut={() => { clearToken(); setState({ status: 'anon', user: null }); }} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
