import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LedgerProvider } from './LedgerContext.jsx';
import Nav          from './components/Nav.jsx';
import Rankings     from './pages/Rankings.jsx';
import Subject      from './pages/Subject.jsx';
import Contracts    from './pages/Contracts.jsx';
import Interactions from './pages/Interactions.jsx';
import Observations from './pages/Observations.jsx';
import Ledger       from './pages/Ledger.jsx';
import Database     from './pages/Database.jsx';
import Api          from './pages/Api.jsx';
import './index.css';

function TopBar() {
  const { pathname } = useLocation();
  const page = pathname.replace('/', '').split('/')[0] || 'rankings';
  return (
    <div className="top-bar">
      <span className="top-bar-page">{page.charAt(0).toUpperCase() + page.slice(1)}</span>
      <span className="top-bar-sep">·</span>
      <span className="top-bar-user">operator::OPERATOR</span>
      <div className="top-bar-status">
        <div className="top-bar-dot" />
        <span className="top-bar-label">Connected</span>
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
              <Route path="/"                element={<Navigate to="/rankings" replace />} />
              <Route path="/rankings"        element={<Rankings />} />
              <Route path="/subject/:party"  element={<div className="page-scroll"><Subject /></div>} />
              <Route path="/interactions"    element={<Interactions />} />
              <Route path="/observations"    element={<Observations />} />
              <Route path="/contracts"       element={<div className="page-scroll"><Contracts /></div>} />
              <Route path="/ledger"          element={<div className="page-scroll"><Ledger /></div>} />
              <Route path="/database"        element={<div className="page-scroll"><Database /></div>} />
              <Route path="/api"             element={<div className="page-scroll"><Api /></div>} />
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
