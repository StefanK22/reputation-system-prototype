import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LedgerProvider } from './LedgerContext.jsx';
import Nav         from './components/Nav.jsx';
import Rankings    from './pages/Rankings.jsx';
import Subject     from './pages/Subject.jsx';
import Config      from './pages/Config.jsx';
import Contracts   from './pages/Contracts.jsx';
import Ledger      from './pages/Ledger.jsx';
import Database    from './pages/Database.jsx';
import Credentials from './pages/Credentials.jsx';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <LedgerProvider>
        <div className="layout">
          <Nav />
          <main className="content">
            <Routes>
              <Route path="/"                element={<Navigate to="/rankings" replace />} />
              <Route path="/rankings"        element={<Rankings />} />
              <Route path="/subject/:party"  element={<Subject />} />
              <Route path="/config"          element={<Config />} />
              <Route path="/contracts"       element={<Contracts />} />
              <Route path="/ledger"          element={<Ledger />} />
              <Route path="/database"        element={<Database />} />
              <Route path="/credentials"     element={<Credentials />} />
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
