import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LedgerProvider, usePartyCtx } from './LedgerContext.jsx';
import Nav             from './components/Nav.jsx';
import Rankings        from './pages/Rankings.jsx';
import Interactions    from './pages/Interactions.jsx';
import Observations    from './pages/Observations.jsx';
import Feedbacks       from './pages/Feedbacks.jsx';
import Ledger          from './pages/Ledger.jsx';
import Database        from './pages/Database.jsx';
import Api             from './pages/Api.jsx';
import Disclosures     from './pages/Disclosures.jsx';
import Setup           from './pages/Setup.jsx';
import './index.css';

function TopBar() {
  const { pathname } = useLocation();
  const { parties, activeParty, setActiveParty } = usePartyCtx();
  const page  = pathname.replace('/', '').split('/')[0] || 'rankings';
  const title = page === 'api-caller' ? 'API' : page.charAt(0).toUpperCase() + page.slice(1);

  return (
    <div className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span className="top-bar-page">{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#999' }}>Logged in as</span>
        <select
          value={activeParty || ''}
          onChange={e => setActiveParty(e.target.value || null)}
          style={{ fontSize: 11, fontFamily: 'inherit', padding: '3px 8px', border: '1px solid #ddd', borderRadius: 3, background: activeParty ? '#e8f0fb' : '#f5f5f5', color: activeParty ? '#1a6abf' : '#555', cursor: 'pointer' }}
        >
          <option value="">Operator (all parties)</option>
          {parties.map(p => (
            <option key={p.party} value={p.party}>{p.displayName}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LedgerProvider>
        <div className="layout">
          <Nav />
          <main className="content">
            <TopBar />
            <Routes>
              <Route path="/"                  element={<Navigate to="/rankings" replace />} />
              <Route path="/rankings"          element={<Rankings />} />
              <Route path="/interactions"      element={<Interactions />} />
              <Route path="/observations"      element={<Observations />} />
              <Route path="/feedback"          element={<Feedbacks />} />
              <Route path="/disclosures"       element={<Disclosures />} />
              <Route path="/setup"             element={<Setup />} />
              <Route path="/ledger"            element={<div className="page-scroll"><Ledger /></div>} />
              <Route path="/database"          element={<div className="page-scroll"><Database /></div>} />
              <Route path="/api-caller"      element={<div className="page-scroll"><Api /></div>} />
            </Routes>
          </main>
        </div>
      </LedgerProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
